from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field


class MicrogridConfigSchema(BaseModel):
    id: str = Field(default="MG-ALPHA-01", description="Microgrid Site Identifier")
    name: str = Field(default="North Regional Microgrid SCADA")
    location: str = Field(default="Sector 7 Clean Tech Park")
    solar_capacity_kw: float = Field(default=350.0, ge=0.0)
    wind_capacity_kw: float = Field(default=150.0, ge=0.0)
    battery_capacity_kwh: float = Field(default=600.0, gt=0.0)
    battery_max_charge_kw: float = Field(default=250.0, gt=0.0)
    battery_max_discharge_kw: float = Field(default=250.0, gt=0.0)
    battery_min_soc: float = Field(default=0.15, ge=0.0, le=1.0)
    battery_max_soc: float = Field(default=0.95, ge=0.0, le=1.0)
    battery_roundtrip_efficiency: float = Field(default=0.92, gt=0.0, le=1.0)
    generator_capacity_kw: float = Field(default=250.0, ge=0.0)
    generator_min_load_kw: float = Field(default=40.0, ge=0.0)
    generator_fuel_rate_l_per_kwh: float = Field(default=0.28, gt=0.0)
    fuel_cost_usd_per_liter: float = Field(default=1.35, gt=0.0)
    generator_co2_kg_per_kwh: float = Field(default=0.72, ge=0.0)
    grid_import_limit_kw: float = Field(default=450.0, ge=0.0)
    grid_export_limit_kw: float = Field(default=350.0, ge=0.0)
    nominal_frequency_hz: float = Field(default=60.0, gt=0.0)
    nominal_voltage_v: float = Field(default=480.0, gt=0.0)


class TelemetrySnapshot(BaseModel):
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    microgrid_id: str = "MG-ALPHA-01"
    load_kw: float = Field(description="Total electrical consumption demand")
    solar_kw: float = Field(description="Active solar PV generation")
    wind_kw: float = Field(description="Active wind turbine generation")
    battery_soc: float = Field(description="Battery State of Charge ratio (0.0 to 1.0)")
    battery_power_kw: float = Field(description="Battery active power: (+) Discharge, (-) Charge")
    generator_power_kw: float = Field(description="Backup diesel/gas generator output")
    grid_power_kw: float = Field(description="Point of Common Coupling: (+) Import, (-) Export")
    net_power_balance_kw: float = Field(default=0.0, description="Sum of generation minus demand (should be ~0)")
    grid_tariff_usd_per_kwh: float = Field(description="Current Time-of-Use retail electricity price")
    grid_feedin_usd_per_kwh: float = Field(description="Current export compensation tariff")
    system_frequency_hz: float = Field(default=60.0)
    bus_voltage_v: float = Field(default=480.0)
    net_cost_usd: float = Field(default=0.0, description="Running energy cost for current interval")
    carbon_emissions_kg: float = Field(default=0.0, description="Emissions generated in current interval")
    grid_connected: bool = Field(default=True, description="PCC breaker state: True=Grid-tied, False=Islanded")
    operational_mode: str = Field(default="AUTO_OPTIMAL", description="Active dispatch control mode")
    renewable_fraction: float = Field(default=0.0, description="Instantaneous clean energy share (0-100%)")
    active_alarms_count: int = Field(default=0)


class HistoricalDataPoint(BaseModel):
    timestamp: datetime
    load_kw: float
    solar_kw: float
    wind_kw: float
    battery_soc: float
    battery_power_kw: float
    generator_power_kw: float
    grid_power_kw: float
    grid_tariff_usd_per_kwh: float
    net_cost_usd: float
    carbon_emissions_kg: float


class ForecastHour(BaseModel):
    hour: int
    time_str: str
    solar_kw: float
    wind_kw: float
    load_kw: float
    tariff_usd_per_kwh: float
    feedin_usd_per_kwh: float


class ScheduleHourlyItem(BaseModel):
    hour: int
    time_str: str
    load_forecast_kw: float
    solar_forecast_kw: float
    wind_forecast_kw: float
    battery_scheduled_kw: float
    battery_expected_soc: float
    generator_scheduled_kw: float
    grid_scheduled_kw: float
    tariff_usd_per_kwh: float
    hourly_cost_usd: float
    hourly_emissions_kg: float


class ScheduleRequest(BaseModel):
    microgrid_id: str = "MG-ALPHA-01"
    horizon_hours: int = Field(default=24, ge=1, le=48)
    algorithm: str = Field(default="mpc_optimal", description="'heuristic', 'mpc_optimal', or 'rl_policy'")
    initial_battery_soc: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    reserve_margin_percent: float = Field(default=20.0, ge=5.0, le=50.0)


class SchedulePlan(BaseModel):
    schedule_id: str
    algorithm: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    horizon_hours: int
    total_expected_cost_usd: float
    baseline_cost_usd: float
    savings_usd: float
    savings_percentage: float
    total_co2_kg: float
    renewable_penetration_avg: float
    hourly_plan: List[ScheduleHourlyItem]


class ControlOverrideRequest(BaseModel):
    operational_mode: Optional[str] = Field(
        default=None,
        description="Mode: 'AUTO_OPTIMAL', 'PEAK_SHAVING', 'ISLANDED', or 'MANUAL_OVERRIDE'"
    )
    grid_connected: Optional[bool] = Field(default=None, description="Set True for Grid-Tied, False to Island")
    manual_battery_kw: Optional[float] = Field(
        default=None,
        description="Desired BESS power: (+) discharge kW, (-) charge kW"
    )
    manual_generator_kw: Optional[float] = Field(
        default=None,
        description="Desired generator setpoint kW"
    )


class AlertItem(BaseModel):
    id: int
    timestamp: datetime
    microgrid_id: str = "MG-ALPHA-01"
    severity: str  # 'INFO', 'WARNING', 'CRITICAL'
    source: str    # 'BATTERY', 'GENERATOR', 'GRID', 'LOAD', 'INVERTER'
    message: str
    metric_value: Optional[float] = None
    resolved: bool = False


class SystemStatusResponse(BaseModel):
    status: str
    uptime_seconds: float
    mode: str
    grid_status: str
    health_score: float
    solar_status: str
    wind_status: str
    battery_status: str
    generator_status: str
    today_solar_kwh: float
    today_wind_kwh: float
    today_consumed_kwh: float
    today_cost_saved_usd: float
    today_co2_avoided_kg: float
