import asyncio
from datetime import datetime, timezone
from typing import Dict, Any
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from schemas.telemetry import TelemetryPayload, TelemetryMetrics
from envs.microgrid_env import MicrogridEnv
from models.dqn_agent import DQNAgent, train_dqn_agent

app = FastAPI(
    title="Microgrid Energy Scheduling API",
    description="Real-time Deep Reinforcement Learning (DQN) Microgrid Scheduling & Telemetry Services",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# Enable CORS for frontend integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global simulation state & environment
env = MicrogridEnv(max_steps=8760) # continuous multi-step horizon
agent = None
active_algorithm = "DQN"
current_obs, _ = env.reset()
latest_info: Dict[str, Any] = {}

def get_trained_agent() -> DQNAgent:
    global agent
    if agent is None:
        print("Initializing & pre-training PyTorch DQN Agent for Microgrid Environment...")
        train_env = MicrogridEnv(max_steps=24)
        agent = train_dqn_agent(train_env, episodes=30)
    return agent

@app.on_event("startup")
async def startup_event():
    get_trained_agent()

def select_action_for_algorithm(obs: Any, algo: str) -> int:
    global agent
    if algo == "DQN":
        if agent is None:
            agent = get_trained_agent()
        return agent.select_action(obs, evaluate=True)
    elif algo == "Rule-Based" or algo == "Heuristic":
        # Heuristic rules:
        # Buy/charge when price is low, discharge when price is high or peak load
        solar, load, soc, buy_price, sell_price, hour = obs
        if buy_price <= 0.10 and soc < 0.85:
            return 0 # Charge max
        elif buy_price >= 0.30 and soc > 0.25:
            return 4 # Discharge max
        elif solar > load and soc < 0.90:
            return 1 # Charge half
        elif load > solar and soc > 0.30:
            return 3 # Discharge half
        return 2 # Idle
    else:
        return env.action_space.sample()

def generate_telemetry_snapshot(info: Dict[str, Any], step: int, algorithm: str) -> TelemetryPayload:
    return TelemetryPayload(
        timestamp=datetime.now(timezone.utc),
        step=step,
        metrics=TelemetryMetrics(
            solar_kw=round(info.get("solar_kw", 0.0), 2),
            load_kw=round(info.get("load_kw", 0.0), 2),
            soc=round(info.get("soc", 0.5), 3),
            battery_power_kw=round(info.get("battery_power_kw", 0.0), 2),
            grid_import_kw=round(info.get("grid_import_kw", 0.0), 2),
            grid_export_kw=round(info.get("grid_export_kw", 0.0), 2),
            buy_price=round(info.get("buy_price", 0.15), 4),
            sell_price=round(info.get("sell_price", 0.0975), 4),
            step_cost=round(info.get("step_cost", 0.0), 3),
            cumulative_cost=round(info.get("cumulative_cost", 0.0), 2),
            baseline_cumulative_cost=round(info.get("baseline_cumulative_cost", 0.0), 2),
            savings_amount=round(info.get("savings_amount", 0.0), 2),
            savings_percent=round(info.get("savings_percent", 0.0), 1),
            grid_available=info.get("grid_available", True),
            scenario=info.get("scenario", "normal"),
            algorithm=algorithm
        )
    )

@app.get("/", tags=["System Status"])
async def root_status() -> Dict[str, Any]:
    return {
        "service": "Microgrid Energy Scheduling Backend",
        "status": "online",
        "timestamp": datetime.now(timezone.utc),
        "version": "1.0.0",
        "active_algorithm": active_algorithm,
        "active_scenario": env.scenario,
        "websocket_endpoint": "/ws/simulation"
    }

@app.get("/api/health", tags=["System Status"])
async def health_check() -> Dict[str, Any]:
    return {
        "status": "healthy",
        "rl_agent": "PyTorch DQN Active" if agent else "Initializing",
        "simulation_step": env.current_step,
        "scenario": env.scenario,
        "simulation_running": True
    }

@app.get("/api/telemetry/latest", response_model=TelemetryPayload, tags=["Telemetry"])
async def get_latest_telemetry():
    return generate_telemetry_snapshot(latest_info, env.current_step, active_algorithm)

@app.get("/api/simulation/config", tags=["Simulation Control"])
async def get_simulation_config() -> Dict[str, Any]:
    return {
        "battery": {
            "capacity_kwh": env.battery_capacity_kwh,
            "max_charge_kw": env.max_charge_kw,
            "max_discharge_kw": env.max_discharge_kw,
            "soc_min": env.soc_min,
            "soc_max": env.soc_max
        },
        "solar_pv": {
            "peak_kw": env.solar_peak_kw
        },
        "scenario": env.scenario
    }

@app.post("/api/simulation/scenario", tags=["Simulation Control"])
async def set_simulation_scenario(scenario_data: Dict[str, str]):
    new_scenario = scenario_data.get("scenario", "normal")
    env.set_scenario(new_scenario)
    return {"message": f"Scenario updated to {new_scenario}", "scenario": env.scenario}

@app.post("/api/simulation/algorithm", tags=["Simulation Control"])
async def set_simulation_algorithm(algo_data: Dict[str, str]):
    global active_algorithm
    active_algorithm = algo_data.get("algorithm", "DQN")
    return {"message": f"Algorithm switched to {active_algorithm}", "algorithm": active_algorithm}

@app.post("/api/simulation/reset", tags=["Simulation Control"])
async def reset_simulation():
    global current_obs, latest_info
    current_obs, _ = env.reset()
    latest_info = {}
    return {"message": "Simulation reset successfully", "step": env.current_step, "cumulative_cost": 0.0}

@app.websocket("/ws/simulation")
async def websocket_simulation(websocket: WebSocket):
    global current_obs, latest_info, active_algorithm
    await websocket.accept()
    
    try:
        while True:
            # Select action via current algorithm policy
            action = select_action_for_algorithm(current_obs, active_algorithm)
            
            # Step environment forward
            next_obs, reward, terminated, truncated, info = env.step(action)
            current_obs = next_obs
            latest_info = info
            
            if terminated or truncated:
                current_obs, _ = env.reset()
            
            payload = generate_telemetry_snapshot(latest_info, env.current_step, active_algorithm)
            await websocket.send_text(payload.model_dump_json())

            await asyncio.sleep(1.0) # 1 step per second
            
    except WebSocketDisconnect:
        print("Client disconnected from WebSocket stream")