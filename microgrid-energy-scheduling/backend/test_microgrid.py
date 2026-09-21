import pytest
from fastapi.testclient import TestClient
from envs.microgrid_env import MicrogridEnv
import main


@pytest.fixture
def env():
    return MicrogridEnv()


@pytest.fixture
def client():
    return TestClient(main.app)


def test_microgrid_env_physics(env):
    """Verifies that physical simulation resets and advances correctly."""
    obs, info = env.reset(seed=42)
    assert len(obs) == 8
    assert info["battery_soc"] == 0.55
    assert info["hour"] == 0.0

    # Step with random action
    action = env.action_space.sample()
    next_obs, reward, term, trunc, step_info = env.step(action)
    assert len(next_obs) == 8
    assert step_info["load_kw"] > 0
    assert 0.15 <= step_info["battery_soc"] <= 0.95
    assert "step_cost_usd" in step_info


def test_microgrid_tariff_windows(env):
    """Verifies Time-of-Use tariff classification."""
    # Peak window (14:00 - 20:00)
    peak_imp, peak_exp = env.get_tariff(16.0)
    assert peak_imp == 0.38
    assert peak_exp == 0.18

    # Shoulder window (07:00 - 14:00)
    sh_imp, sh_exp = env.get_tariff(10.0)
    assert sh_imp == 0.22
    assert sh_exp == 0.10

    # Off-peak window (night)
    off_imp, off_exp = env.get_tariff(2.0)
    assert off_imp == 0.12
    assert off_exp == 0.06


def test_24h_optimization_engines(env):
    """Verifies all 3 dispatch optimization algorithms execute and compute savings."""
    for algo in ["mpc_optimal", "heuristic", "rl_policy"]:
        plan = env.optimize_24h_schedule(algorithm=algo, initial_soc=0.60)
        assert plan["horizon_hours"] == 24
        assert len(plan["hourly_plan"]) == 24
        assert plan["total_expected_cost_usd"] > 0
        assert plan["baseline_cost_usd"] >= plan["total_expected_cost_usd"]
        assert plan["savings_usd"] >= 0.0


def test_api_endpoints(client):
    """Tests all REST API endpoints."""
    # 1. Health check
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json()["status"] == "healthy"

    # 2. Live telemetry snapshot
    res = client.get("/api/telemetry/live")
    assert res.status_code == 200
    data = res.json()
    assert data["microgrid_id"] == "MG-ALPHA-01"
    assert data["load_kw"] > 0

    # 3. 24h Forecast
    res = client.get("/api/forecast/24h")
    assert res.status_code == 200
    assert len(res.json()) == 24

    # 4. Schedule optimization endpoint
    payload = {
        "microgrid_id": "MG-ALPHA-01",
        "horizon_hours": 24,
        "algorithm": "mpc_optimal",
        "reserve_margin_percent": 20.0
    }
    res = client.post("/api/schedule/optimize", json=payload)
    assert res.status_code == 200
    sched = res.json()
    assert sched["algorithm"] == "mpc_optimal"
    assert len(sched["hourly_plan"]) == 24

    # 5. Islanding & Control Override
    cmd = {
        "grid_connected": False,
        "operational_mode": "ISLANDED",
        "manual_battery_kw": 80.0
    }
    res = client.post("/api/control/override", json=cmd)
    assert res.status_code == 200
    assert res.json()["status"] == "SUCCESS"
    assert res.json()["grid_connected"] is False

    # 6. Reconnect Grid
    res = client.post("/api/control/override", json={"grid_connected": True, "operational_mode": "AUTO_OPTIMAL"})
    assert res.status_code == 200
    assert res.json()["grid_connected"] is True

    # 7. Alerts
    res = client.get("/api/alerts")
    assert res.status_code == 200
    assert len(res.json()) >= 1

    # 8. System Status
    res = client.get("/api/system/status")
    assert res.status_code == 200
    assert res.json()["health_score"] > 80.0
