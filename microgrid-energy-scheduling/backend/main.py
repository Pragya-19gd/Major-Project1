import asyncio
from contextlib import asynccontextmanager
from datetime import datetime, timedelta
import json
import logging
import os
import random
import sys
from typing import Any, Dict, List, Optional, Set

from fastapi import FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import numpy as np

# Internal imports
from envs.microgrid_env import MicrogridEnv
from schemas.telemetry import (
    AlertItem,
    ControlOverrideRequest,
    ForecastHour,
    HistoricalDataPoint,
    MicrogridConfigSchema,
    ScheduleHourlyItem,
    SchedulePlan,
    ScheduleRequest,
    SystemStatusResponse,
    TelemetrySnapshot,
)

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("microgrid-telemetry")

# Database configurations
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./microgrid.db")
IS_SQLITE = "sqlite" in DATABASE_URL or "postgres" not in DATABASE_URL
SQLITE_FILE = "microgrid.db"

# Global system state
active_websockets: Set[WebSocket] = set()
simulation_task: Optional[asyncio.Task] = None
system_start_time = datetime.utcnow()

# Persistent in-memory cache and state manager
microgrid_env = MicrogridEnv()
current_telemetry: Optional[TelemetrySnapshot] = None
historical_buffer: List[Dict[str, Any]] = []
alert_storage: List[Dict[str, Any]] = []

# Manual Overrides State
manual_overrides = {
    "active": False,
    "battery_kw": None,
    "generator_kw": None,
}


def init_in_memory_history_and_alerts():
    """Seeds rich 24-hour historical records and standard SCADA alarms."""
    global historical_buffer, alert_storage, current_telemetry
    historical_buffer.clear()
    alert_storage.clear()

    now = datetime.utcnow()
    # Generate 24 hours of 1-hour interval historical points
    sim_soc = 0.52
    for i in range(24, 0, -1):
        pt_time = now - timedelta(hours=i)
        h = pt_time.hour + (pt_time.minute / 60.0)
        l, s, w = microgrid_env.generate_profiles(h, noise_scale=0.8)
        tariff, feedin = microgrid_env.get_tariff(h)

        # Realistic historical battery and grid behavior
        if 14 <= h < 20:
            batt_kw = 110.0 + random.uniform(-10, 10)
            sim_soc = max(0.20, sim_soc - 0.08)
        elif s + w > l:
            batt_kw = -min(120.0, (s + w - l) * 0.8)
            sim_soc = min(0.92, sim_soc + 0.09)
        else:
            batt_kw = 0.0

        grid_kw = l - (s + w + batt_kw)
        cost = (grid_kw * tariff) if grid_kw >= 0 else (grid_kw * feedin)

        historical_buffer.append({
            "timestamp": pt_time.isoformat(),
            "load_kw": round(l, 2),
            "solar_kw": round(s, 2),
            "wind_kw": round(w, 2),
            "battery_soc": round(sim_soc, 3),
            "battery_power_kw": round(batt_kw, 2),
            "generator_power_kw": 0.0,
            "grid_power_kw": round(grid_kw, 2),
            "grid_tariff_usd_per_kwh": round(tariff, 3),
            "net_cost_usd": round(cost, 2),
            "carbon_emissions_kg": round(max(0.0, grid_kw) * 0.38, 2),
        })

    # Initial realistic system alerts
    alert_storage.extend([
        {
            "id": 101,
            "timestamp": (now - timedelta(hours=2, minutes=15)).isoformat(),
            "microgrid_id": "MG-ALPHA-01",
            "severity": "INFO",
            "source": "INVERTER",
            "message": "Solar PV Inverter Bank 1 synchronized with microgrid bus at 60.0 Hz.",
            "metric_value": 60.01,
            "resolved": True,
        },
        {
            "id": 102,
            "timestamp": (now - timedelta(hours=1, minutes=5)).isoformat(),
            "microgrid_id": "MG-ALPHA-01",
            "severity": "WARNING",
            "source": "GRID",
            "message": "Peak tariff window active ($0.380/kWh). Battery peak shaving dispatched.",
            "metric_value": 0.38,
            "resolved": False,
        },
        {
            "id": 103,
            "timestamp": (now - timedelta(minutes=18)).isoformat(),
            "microgrid_id": "MG-ALPHA-01",
            "severity": "INFO",
            "source": "BATTERY",
            "message": "BESS cell thermal management nominal at 24.8°C.",
            "metric_value": 24.8,
            "resolved": True,
        },
    ])
    
    # Initialize initial current_telemetry snapshot so it is immediately available
    cur_h = (now.hour + now.minute / 60.0) % 24.0
    cur_l, cur_s, cur_w = microgrid_env.generate_profiles(cur_h, noise_scale=0.5)
    cur_imp, cur_exp = microgrid_env.get_tariff(cur_h)
    grid_kw = cur_l - (cur_s + cur_w)
    
    current_telemetry = TelemetrySnapshot(
        timestamp=now,
        microgrid_id="MG-ALPHA-01",
        load_kw=round(cur_l, 2),
        solar_kw=round(cur_s, 2),
        wind_kw=round(cur_w, 2),
        battery_soc=round(microgrid_env.battery_soc, 4),
        battery_power_kw=0.0,
        generator_power_kw=0.0,
        grid_power_kw=round(grid_kw, 2),
        net_power_balance_kw=0.0,
        grid_tariff_usd_per_kwh=round(cur_imp, 3),
        grid_feedin_usd_per_kwh=round(cur_exp, 3),
        system_frequency_hz=60.0,
        bus_voltage_v=480.0,
        net_cost_usd=round(grid_kw * cur_imp, 2) if grid_kw >= 0 else round(grid_kw * cur_exp, 2),
        carbon_emissions_kg=round(max(0.0, grid_kw) * 0.38, 2),
        grid_connected=True,
        operational_mode="AUTO_OPTIMAL",
        renewable_fraction=round(min(100.0, (cur_s + cur_w) / (cur_l + 1e-4) * 100.0), 1),
        active_alarms_count=1,
    )

# Pre-populate history and telemetry at import time
init_in_memory_history_and_alerts()


async def background_simulation_loop():
    """
    Continuous real-time simulation background task.
    Evolves physical DER dynamics, calculates power balance,
    records historical points, and streams updates to WebSockets.
    """
    global current_telemetry, manual_overrides
    logger.info("Starting real-time microgrid simulation loop...")

    step_interval = float(os.getenv("SIMULATION_INTERVAL_SECONDS", "1.0"))

    while True:
        try:
            now = datetime.utcnow()
            # Advance fractional time of day for continuous day-night cycle
            hour_float = (now.hour + (now.minute / 60.0) + (now.second / 3600.0)) % 24.0
            microgrid_env.current_hour = hour_float

            # Physical generation & demand
            load_kw, solar_kw, wind_kw = microgrid_env.generate_profiles(hour_float, noise_scale=0.9)
            tariff, feedin = microgrid_env.get_tariff(hour_float)
            renewables_kw = solar_kw + wind_kw
            net_demand = load_kw - renewables_kw

            # Check for manual overrides or auto optimal mode
            if manual_overrides["active"]:
                op_mode = "MANUAL_OVERRIDE"
                batt_kw = manual_overrides["battery_kw"] if manual_overrides["battery_kw"] is not None else 0.0
                gen_kw = manual_overrides["generator_kw"] if manual_overrides["generator_kw"] is not None else 0.0
            else:
                op_mode = microgrid_env.operational_mode
                # Auto dispatch logic
                if not microgrid_env.grid_connected:
                    op_mode = "ISLANDED"
                    # In islanded mode, battery + generator must cover 100% of deficit
                    if net_demand > 0:
                        avail_bess = max(0.0, (microgrid_env.battery_soc - microgrid_env.battery_min_soc) * microgrid_env.battery_capacity_kwh)
                        batt_kw = min(net_demand, microgrid_env.battery_max_discharge_kw, avail_bess)
                        deficit = net_demand - batt_kw
                        gen_kw = min(microgrid_env.generator_capacity_kw, max(0.0, deficit))
                    else:
                        gen_kw = 0.0
                        charge_room = (microgrid_env.battery_max_soc - microgrid_env.battery_soc) * microgrid_env.battery_capacity_kwh
                        batt_kw = -min(abs(net_demand), microgrid_env.battery_max_charge_kw, charge_room)
                else:
                    gen_kw = 0.0
                    # Grid-tied optimization:
                    if 14.0 <= hour_float < 20.0:  # Peak price window: discharge battery
                        avail_discharge = max(0.0, (microgrid_env.battery_soc - microgrid_env.battery_min_soc) * microgrid_env.battery_capacity_kwh)
                        batt_kw = min(net_demand, microgrid_env.battery_max_discharge_kw, avail_discharge)
                    elif net_demand < 0:  # Surplus clean power: charge battery
                        charge_headroom = (microgrid_env.battery_max_soc - microgrid_env.battery_soc) * microgrid_env.battery_capacity_kwh
                        batt_kw = -min(abs(net_demand), microgrid_env.battery_max_charge_kw, charge_headroom)
                    elif hour_float < 6.0 and microgrid_env.battery_soc < 0.75:  # Off-peak grid charging
                        charge_headroom = (0.75 - microgrid_env.battery_soc) * microgrid_env.battery_capacity_kwh
                        batt_kw = -min(microgrid_env.battery_max_charge_kw * 0.4, charge_headroom)
                    else:
                        batt_kw = 0.0

            # Battery SoC update physics
            dt_hours = step_interval / 3600.0
            eff = 0.96
            if batt_kw > 0:  # Discharging
                delta_soc = -(batt_kw / eff * dt_hours) / microgrid_env.battery_capacity_kwh
            else:  # Charging
                delta_soc = (abs(batt_kw) * eff * dt_hours) / microgrid_env.battery_capacity_kwh
            microgrid_env.battery_soc = max(0.15, min(0.95, microgrid_env.battery_soc + delta_soc))

            # Grid interaction (Point of Common Coupling)
            if microgrid_env.grid_connected:
                grid_kw = net_demand - batt_kw - gen_kw
            else:
                grid_kw = 0.0

            # Power balance check
            net_balance = (solar_kw + wind_kw + gen_kw + batt_kw + grid_kw) - load_kw

            # Power quality parameters (slight dynamic jitter around nominal 60Hz and 480V)
            freq_deviation = (net_balance / 2000.0) + (random.uniform(-0.02, 0.02))
            system_freq = round(60.0 + freq_deviation, 3)
            bus_voltage = round(480.0 + (random.uniform(-1.5, 1.5)) - (load_kw * 0.005), 2)

            # Financial and carbon calculations
            if grid_kw >= 0:
                cost_rate = grid_kw * tariff
            else:
                cost_rate = grid_kw * feedin
            fuel_rate = (gen_kw * microgrid_env.fuel_rate_l_per_kwh * microgrid_env.fuel_cost_usd_per_liter) if gen_kw > 0 else 0.0
            net_step_cost = round(cost_rate + fuel_rate, 3)
            carbon_rate = round((max(0.0, grid_kw) * 0.38) + (gen_kw * microgrid_env.generator_co2_kg_per_kwh), 3)

            renewable_fraction = min(100.0, max(0.0, (solar_kw + wind_kw) / (load_kw + 1e-4) * 100.0))
            unresolved_alarms = sum(1 for a in alert_storage if not a.get("resolved", False))

            # Assemble real-time snapshot
            current_telemetry = TelemetrySnapshot(
                timestamp=now,
                microgrid_id="MG-ALPHA-01",
                load_kw=round(load_kw, 2),
                solar_kw=round(solar_kw, 2),
                wind_kw=round(wind_kw, 2),
                battery_soc=round(microgrid_env.battery_soc, 4),
                battery_power_kw=round(batt_kw, 2),
                generator_power_kw=round(gen_kw, 2),
                grid_power_kw=round(grid_kw, 2),
                net_power_balance_kw=round(net_balance, 3),
                grid_tariff_usd_per_kwh=round(tariff, 3),
                grid_feedin_usd_per_kwh=round(feedin, 3),
                system_frequency_hz=system_freq,
                bus_voltage_v=bus_voltage,
                net_cost_usd=net_step_cost,
                carbon_emissions_kg=carbon_rate,
                grid_connected=microgrid_env.grid_connected,
                operational_mode=op_mode,
                renewable_fraction=round(renewable_fraction, 1),
                active_alarms_count=unresolved_alarms,
            )

            # Append to rolling history
            historical_buffer.append({
                "timestamp": now.isoformat(),
                "load_kw": current_telemetry.load_kw,
                "solar_kw": current_telemetry.solar_kw,
                "wind_kw": current_telemetry.wind_kw,
                "battery_soc": current_telemetry.battery_soc,
                "battery_power_kw": current_telemetry.battery_power_kw,
                "generator_power_kw": current_telemetry.generator_power_kw,
                "grid_power_kw": current_telemetry.grid_power_kw,
                "grid_tariff_usd_per_kwh": current_telemetry.grid_tariff_usd_per_kwh,
                "net_cost_usd": current_telemetry.net_cost_usd,
                "carbon_emissions_kg": current_telemetry.carbon_emissions_kg,
            })
            if len(historical_buffer) > 1000:
                historical_buffer.pop(0)

            # Check for alarm conditions
            if microgrid_env.battery_soc <= 0.18:
                existing = any(a["source"] == "BATTERY" and not a["resolved"] for a in alert_storage)
                if not existing:
                    alert_storage.insert(0, {
                        "id": len(alert_storage) + 1,
                        "timestamp": now.isoformat(),
                        "microgrid_id": "MG-ALPHA-01",
                        "severity": "CRITICAL",
                        "source": "BATTERY",
                        "message": f"Battery State of Charge critically low ({round(microgrid_env.battery_soc*100, 1)}%). Reserve limit reached.",
                        "metric_value": round(microgrid_env.battery_soc, 3),
                        "resolved": False,
                    })

            # Broadcast to connected WebSocket clients
            if active_websockets:
                payload = current_telemetry.model_dump_json()
                disconnected_clients = set()
                for ws in active_websockets:
                    try:
                        await ws.send_text(payload)
                    except Exception:
                        disconnected_clients.add(ws)
                for dead_ws in disconnected_clients:
                    active_websockets.remove(dead_ws)

        except Exception as e:
            logger.error(f"Error in simulation loop: {e}", exc_info=True)

        await asyncio.sleep(step_interval)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application startup and shutdown orchestration."""
    global simulation_task
    logger.info("Initializing Microgrid SCADA Telemetry System...")
    init_in_memory_history_and_alerts()
    # Start background physics simulation task
    simulation_task = asyncio.create_task(background_simulation_loop())
    yield
    # Graceful shutdown
    if simulation_task:
        simulation_task.cancel()
        try:
            await simulation_task
        except asyncio.CancelledError:
            pass
    logger.info("Microgrid SCADA Telemetry System stopped.")


app = FastAPI(
    title="Microgrid Energy Scheduling & Real-Time Telemetry API",
    description="Production-grade DER Energy Management, Real-Time Physics Telemetry, and 24h Optimal Scheduling",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ====================================================================
# REST API ENDPOINTS
# ====================================================================

@app.get("/")
def get_root():
    return {
        "system": "Microgrid Energy Scheduling & Real-Time Telemetry SCADA",
        "status": "ONLINE",
        "version": "2.0.0",
        "timestamp": datetime.utcnow().isoformat(),
        "endpoints": [
            "/api/telemetry/live",
            "/api/telemetry/history",
            "/api/forecast/24h",
            "/api/schedule/optimize",
            "/api/control/override",
            "/api/system/status",
            "/api/alerts",
            "/ws/telemetry",
            "/docs",
        ],
    }


@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "simulation_running": simulation_task is not None and not simulation_task.done(),
        "active_ws_connections": len(active_websockets),
        "timestamp": datetime.utcnow().isoformat(),
    }


@app.get("/api/config", response_model=MicrogridConfigSchema)
def get_microgrid_config():
    """Retrieves physical asset capacities and operational thresholds."""
    return MicrogridConfigSchema(
        id="MG-ALPHA-01",
        name="North Regional Microgrid SCADA",
        location="Sector 7 Clean Tech Park",
        solar_capacity_kw=microgrid_env.solar_capacity_kw,
        wind_capacity_kw=microgrid_env.wind_capacity_kw,
        battery_capacity_kwh=microgrid_env.battery_capacity_kwh,
        battery_max_charge_kw=microgrid_env.battery_max_charge_kw,
        battery_max_discharge_kw=microgrid_env.battery_max_discharge_kw,
        battery_min_soc=microgrid_env.battery_min_soc,
        battery_max_soc=microgrid_env.battery_max_soc,
        battery_roundtrip_efficiency=microgrid_env.battery_efficiency,
        generator_capacity_kw=microgrid_env.generator_capacity_kw,
        generator_min_load_kw=microgrid_env.generator_min_load_kw,
        generator_fuel_rate_l_per_kwh=microgrid_env.fuel_rate_l_per_kwh,
        fuel_cost_usd_per_liter=microgrid_env.fuel_cost_usd_per_liter,
        generator_co2_kg_per_kwh=microgrid_env.generator_co2_kg_per_kwh,
        grid_import_limit_kw=microgrid_env.grid_import_limit_kw,
        grid_export_limit_kw=microgrid_env.grid_export_limit_kw,
    )


@app.get("/api/telemetry/live", response_model=TelemetrySnapshot)
def get_live_telemetry():
    """Returns the most recent real-time microgrid telemetry snapshot."""
    if current_telemetry is None:
        raise HTTPException(status_code=503, detail="Simulation telemetry initializing...")
    return current_telemetry


@app.get("/api/telemetry/history", response_model=List[HistoricalDataPoint])
def get_telemetry_history(hours: int = Query(default=24, ge=1, le=168)):
    """Retrieves rolling historical telemetry points for plotting trends."""
    cutoff = datetime.utcnow() - timedelta(hours=hours)
    results = []
    for item in historical_buffer:
        try:
            pt_time = datetime.fromisoformat(item["timestamp"])
            if pt_time >= cutoff:
                results.append(HistoricalDataPoint(
                    timestamp=pt_time,
                    load_kw=item["load_kw"],
                    solar_kw=item["solar_kw"],
                    wind_kw=item["wind_kw"],
                    battery_soc=item["battery_soc"],
                    battery_power_kw=item["battery_power_kw"],
                    generator_power_kw=item["generator_power_kw"],
                    grid_power_kw=item["grid_power_kw"],
                    grid_tariff_usd_per_kwh=item["grid_tariff_usd_per_kwh"],
                    net_cost_usd=item["net_cost_usd"],
                    carbon_emissions_kg=item["carbon_emissions_kg"],
                ))
        except Exception:
            continue
    return results


@app.get("/api/forecast/24h", response_model=List[ForecastHour])
def get_24h_forecast():
    """Provides 24-hour lookahead profiles for solar, wind, load, and grid tariff."""
    forecasts = []
    now = datetime.utcnow()
    current_h = now.hour
    for offset in range(24):
        target_h = (current_h + offset) % 24
        l, s, w = microgrid_env.generate_profiles(float(target_h), noise_scale=0.0)
        tariff, feedin = microgrid_env.get_tariff(float(target_h))
        time_label = f"{(current_h + offset) % 24:02d}:00"
        forecasts.append(ForecastHour(
            hour=target_h,
            time_str=time_label,
            solar_kw=round(s, 2),
            wind_kw=round(w, 2),
            load_kw=round(l, 2),
            tariff_usd_per_kwh=round(tariff, 3),
            feedin_usd_per_kwh=round(feedin, 3),
        ))
    return forecasts


@app.post("/api/schedule/optimize", response_model=SchedulePlan)
def run_schedule_optimization(request: ScheduleRequest):
    """
    Executes 24-hour horizon energy scheduling optimization.
    Algorithms available: 'mpc_optimal', 'heuristic', or 'rl_policy'.
    """
    plan = microgrid_env.optimize_24h_schedule(
        algorithm=request.algorithm,
        initial_soc=request.initial_battery_soc or microgrid_env.battery_soc,
        reserve_margin=request.reserve_margin_percent / 100.0,
    )
    return SchedulePlan(**plan)


@app.post("/api/control/override")
def apply_control_override(cmd: ControlOverrideRequest):
    """
    Manually overrides microgrid dispatch setpoints or islanding breaker state.
    """
    global manual_overrides

    if cmd.grid_connected is not None:
        microgrid_env.grid_connected = cmd.grid_connected
        state_str = "GRID-TIED" if cmd.grid_connected else "ISLANDED (ISOLATED)"
        alert_storage.insert(0, {
            "id": len(alert_storage) + 1,
            "timestamp": datetime.utcnow().isoformat(),
            "microgrid_id": "MG-ALPHA-01",
            "severity": "WARNING" if not cmd.grid_connected else "INFO",
            "source": "GRID",
            "message": f"Point of Common Coupling (PCC) breaker commanded to {state_str}.",
            "metric_value": 1.0 if cmd.grid_connected else 0.0,
            "resolved": False,
        })

    if cmd.operational_mode is not None:
        microgrid_env.operational_mode = cmd.operational_mode
        if cmd.operational_mode == "MANUAL_OVERRIDE":
            manual_overrides["active"] = True
        else:
            manual_overrides["active"] = False

    if cmd.manual_battery_kw is not None:
        manual_overrides["active"] = True
        manual_overrides["battery_kw"] = max(
            -microgrid_env.battery_max_charge_kw,
            min(microgrid_env.battery_max_discharge_kw, cmd.manual_battery_kw),
        )

    if cmd.manual_generator_kw is not None:
        manual_overrides["active"] = True
        manual_overrides["generator_kw"] = max(
            0.0,
            min(microgrid_env.generator_capacity_kw, cmd.manual_generator_kw),
        )

    return {
        "status": "SUCCESS",
        "message": "Control parameters applied to microgrid controller",
        "operational_mode": microgrid_env.operational_mode,
        "grid_connected": microgrid_env.grid_connected,
        "manual_overrides": manual_overrides,
    }


@app.get("/api/alerts", response_model=List[AlertItem])
def get_alerts():
    """Fetches active and historical alerts."""
    return [
        AlertItem(
            id=a["id"],
            timestamp=datetime.fromisoformat(a["timestamp"]),
            microgrid_id=a.get("microgrid_id", "MG-ALPHA-01"),
            severity=a["severity"],
            source=a["source"],
            message=a["message"],
            metric_value=a.get("metric_value"),
            resolved=a["resolved"],
        )
        for a in alert_storage
    ]


@app.post("/api/alerts/{alert_id}/resolve")
def resolve_alert(alert_id: int):
    """Marks an active SCADA alarm as acknowledged/resolved."""
    for alert in alert_storage:
        if alert["id"] == alert_id:
            alert["resolved"] = True
            return {"status": "SUCCESS", "message": f"Alert {alert_id} resolved."}
    raise HTTPException(status_code=404, detail="Alert not found.")


@app.get("/api/system/status", response_model=SystemStatusResponse)
def get_system_status():
    """Returns overall microgrid health, subsystem states, and cumulative daily metrics."""
    uptime = (datetime.utcnow() - system_start_time).total_seconds()
    tot_solar = sum(p["solar_kw"] for p in historical_buffer) * (len(historical_buffer) / 24.0)
    tot_wind = sum(p["wind_kw"] for p in historical_buffer) * (len(historical_buffer) / 24.0)
    tot_load = sum(p["load_kw"] for p in historical_buffer) * (len(historical_buffer) / 24.0)

    # Clean energy savings estimation
    saved_usd = (tot_solar + tot_wind) * 0.18
    co2_saved = (tot_solar + tot_wind) * 0.45

    return SystemStatusResponse(
        status="HEALTHY" if microgrid_env.grid_connected else "ISLANDED_OPERATIONAL",
        uptime_seconds=round(uptime, 1),
        mode=microgrid_env.operational_mode,
        grid_status="CONNECTED" if microgrid_env.grid_connected else "ISLANDED",
        health_score=98.5 if microgrid_env.grid_connected else 91.2,
        solar_status="OPTIMAL (MPPT Active)" if (6 <= microgrid_env.current_hour <= 19) else "STANDBY (Night)",
        wind_status="ACTIVE (Synchronized)",
        battery_status=f"NORMAL ({round(microgrid_env.battery_soc*100, 1)}% SoC)",
        generator_status="STANDBY" if manual_overrides.get("generator_kw", 0) in (0, None) else "DISPATCHED",
        today_solar_kwh=round(tot_solar, 1),
        today_wind_kwh=round(tot_wind, 1),
        today_consumed_kwh=round(tot_load, 1),
        today_cost_saved_usd=round(saved_usd, 2),
        today_co2_avoided_kg=round(co2_saved, 2),
    )


# ====================================================================
# WEBSOCKET REAL-TIME STREAMING
# ====================================================================

@app.websocket("/ws/telemetry")
async def websocket_telemetry_stream(websocket: WebSocket):
    """
    High-frequency WebSocket endpoint for real-time SCADA telemetry broadcasting.
    """
    await websocket.accept()
    active_websockets.add(websocket)
    logger.info(f"WebSocket client connected. Active clients: {len(active_websockets)}")

    try:
        # Push instantaneous telemetry immediately on connect
        if current_telemetry:
            await websocket.send_text(current_telemetry.model_dump_json())

        while True:
            # Receive client messages / heartbeats or commands
            message_text = await websocket.receive_text()
            try:
                msg_data = json.loads(message_text)
                if msg_data.get("action") == "ping":
                    await websocket.send_text(json.dumps({"action": "pong", "timestamp": datetime.utcnow().isoformat()}))
                elif msg_data.get("action") == "override":
                    # Handle real-time control adjustments via WS
                    if "grid_connected" in msg_data:
                        microgrid_env.grid_connected = bool(msg_data["grid_connected"])
                    if "battery_kw" in msg_data:
                        manual_overrides["active"] = True
                        manual_overrides["battery_kw"] = float(msg_data["battery_kw"])
            except json.JSONDecodeError:
                pass

    except WebSocketDisconnect:
        active_websockets.remove(websocket)
        logger.info(f"WebSocket client disconnected. Active clients: {len(active_websockets)}")
    except Exception as e:
        if websocket in active_websockets:
            active_websockets.remove(websocket)
        logger.warning(f"WebSocket connection error: {e}")


if __name__ == "__main__":
    import uvicorn
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "8000"))
    logger.info(f"Starting uvicorn server on {host}:{port}")
    uvicorn.run("main:app", host=host, port=port, reload=True)
