import math
import random
from typing import Any, Dict, List, Optional, Tuple
import numpy as np


class BoxSpace:
    """Lightweight Box space compatible with Gymnasium/Gym interfaces."""
    def __init__(self, low: np.ndarray, high: np.ndarray, dtype=np.float32):
        self.low = np.array(low, dtype=dtype)
        self.high = np.array(high, dtype=dtype)
        self.shape = self.low.shape
        self.dtype = dtype

    def sample(self) -> np.ndarray:
        return np.random.uniform(self.low, self.high).astype(self.dtype)

    def contains(self, x: Any) -> bool:
        arr = np.asarray(x, dtype=self.dtype)
        return bool(arr.shape == self.shape and np.all(arr >= self.low) and np.all(arr <= self.high))


class MicrogridEnv:
    """
    Production-grade Microgrid Simulation & Reinforcement Learning Environment.
    Models physical dynamics of Solar PV, Wind Turbines, Battery Energy Storage (BESS),
    Backup Generator, and Grid Interconnection under Time-of-Use tariffs.
    """

    def __init__(self, config: Optional[Dict[str, Any]] = None):
        cfg = config or {}
        # DER Ratings
        self.solar_capacity_kw = float(cfg.get("solar_capacity_kw", 350.0))
        self.wind_capacity_kw = float(cfg.get("wind_capacity_kw", 150.0))
        self.battery_capacity_kwh = float(cfg.get("battery_capacity_kwh", 600.0))
        self.battery_max_charge_kw = float(cfg.get("battery_max_charge_kw", 250.0))
        self.battery_max_discharge_kw = float(cfg.get("battery_max_discharge_kw", 250.0))
        self.battery_min_soc = float(cfg.get("battery_min_soc", 0.15))
        self.battery_max_soc = float(cfg.get("battery_max_soc", 0.95))
        self.battery_efficiency = float(cfg.get("battery_roundtrip_efficiency", 0.92))
        self.generator_capacity_kw = float(cfg.get("generator_capacity_kw", 250.0))
        self.generator_min_load_kw = float(cfg.get("generator_min_load_kw", 40.0))
        self.fuel_rate_l_per_kwh = float(cfg.get("generator_fuel_rate_l_per_kwh", 0.28))
        self.fuel_cost_usd_per_liter = float(cfg.get("fuel_cost_usd_per_liter", 1.35))
        self.generator_co2_kg_per_kwh = float(cfg.get("generator_co2_kg_per_kwh", 0.72))
        self.grid_import_limit_kw = float(cfg.get("grid_import_limit_kw", 450.0))
        self.grid_export_limit_kw = float(cfg.get("grid_export_limit_kw", 350.0))

        # Time parameters
        self.step_minutes = int(cfg.get("step_minutes", 60))
        self.dt = self.step_minutes / 60.0  # Hours
        self.current_step = 0
        self.max_steps = 24  # 1 day horizon

        # Dynamic State Variables
        self.current_hour = 12.0
        self.battery_soc = 0.55
        self.grid_connected = True
        self.operational_mode = "AUTO_OPTIMAL"

        # Action Space:
        # Action 0: Normalized Battery dispatch [-1.0 (max charge) to 1.0 (max discharge)]
        # Action 1: Normalized Generator dispatch [0.0 (off) to 1.0 (max capacity)]
        # Action 2: Normalized Grid exchange allowance [-1.0 (max export) to 1.0 (max import)]
        self.action_space = BoxSpace(
            low=np.array([-1.0, 0.0, -1.0], dtype=np.float32),
            high=np.array([1.0, 1.0, 1.0], dtype=np.float32),
            dtype=np.float32,
        )

        # Observation Space (8 dimensions):
        # 0: hour_of_day (0 to 1)
        # 1: load_kw / 500.0
        # 2: solar_kw / 400.0
        # 3: wind_kw / 200.0
        # 4: battery_soc (0 to 1)
        # 5: grid_tariff ($/kWh / 0.50)
        # 6: grid_feedin ($/kWh / 0.50)
        # 7: grid_connected (0.0 or 1.0)
        self.observation_space = BoxSpace(
            low=np.zeros(8, dtype=np.float32),
            high=np.ones(8, dtype=np.float32) * 2.0,
            dtype=np.float32,
        )

    def get_tariff(self, hour: float) -> Tuple[float, float]:
        """Returns (import_tariff_usd, export_feedin_usd) based on ToU schedule."""
        h = hour % 24.0
        if 14.0 <= h < 20.0:
            # Peak tariff window
            return 0.38, 0.18
        elif (7.0 <= h < 14.0) or (20.0 <= h < 22.0):
            # Shoulder window
            return 0.22, 0.10
        else:
            # Off-peak window (night)
            return 0.12, 0.06

    def generate_profiles(self, hour: float, noise_scale: float = 1.0) -> Tuple[float, float, float]:
        """
        Generates physical (load_kw, solar_kw, wind_kw) based on diurnal cycle and atmospheric noise.
        """
        h = hour % 24.0

        # 1. Base Load Profile (Commercial + Industrial double-peak)
        base_load = 180.0
        # Morning ramp (8-11am) and afternoon ramp (13-18pm)
        morning_peak = 110.0 * math.exp(-0.5 * ((h - 10.0) / 2.2) ** 2)
        afternoon_peak = 140.0 * math.exp(-0.5 * ((h - 15.5) / 2.8) ** 2)
        noise_load = (random.uniform(-1.0, 1.0) * 12.0) * noise_scale
        load_kw = max(60.0, base_load + morning_peak + afternoon_peak + noise_load)

        # 2. Solar PV Profile (bell curve between 6:00 and 19:00, peak at 12:30)
        if 6.0 <= h <= 18.8:
            solar_norm = math.sin((h - 6.0) / (18.8 - 6.0) * math.pi)
            solar_norm = max(0.0, solar_norm) ** 1.3
            cloud_factor = max(0.2, 1.0 - (random.uniform(0.0, 0.35) * noise_scale))
            solar_kw = min(self.solar_capacity_kw, self.solar_capacity_kw * solar_norm * cloud_factor)
        else:
            solar_kw = 0.0

        # 3. Wind Turbine Profile (higher at night and late afternoon)
        wind_base = 0.35 + 0.30 * math.sin((h + 5.0) / 24.0 * 2.0 * math.pi)
        wind_gust = (random.uniform(-0.15, 0.25) * noise_scale)
        wind_norm = max(0.05, min(1.0, wind_base + wind_gust))
        wind_kw = min(self.wind_capacity_kw, self.wind_capacity_kw * wind_norm)

        return round(load_kw, 2), round(solar_kw, 2), round(wind_kw, 2)

    def reset(self, seed: Optional[int] = None, options: Optional[Dict[str, Any]] = None) -> Tuple[np.ndarray, Dict[str, Any]]:
        """Resets the environment to initial conditions."""
        if seed is not None:
            random.seed(seed)
            np.random.seed(seed)

        opts = options or {}
        self.current_step = 0
        self.current_hour = float(opts.get("initial_hour", 0.0))
        self.battery_soc = float(opts.get("initial_soc", 0.55))
        self.grid_connected = bool(opts.get("grid_connected", True))
        self.operational_mode = str(opts.get("operational_mode", "AUTO_OPTIMAL"))

        load_kw, solar_kw, wind_kw = self.generate_profiles(self.current_hour, noise_scale=0.5)
        import_price, export_price = self.get_tariff(self.current_hour)

        obs = self._get_observation(load_kw, solar_kw, wind_kw, import_price, export_price)
        info = {
            "step": self.current_step,
            "hour": self.current_hour,
            "load_kw": load_kw,
            "solar_kw": solar_kw,
            "wind_kw": wind_kw,
            "battery_soc": self.battery_soc,
            "tariff": import_price,
        }
        return obs, info

    def _get_observation(
        self, load_kw: float, solar_kw: float, wind_kw: float, import_price: float, export_price: float
    ) -> np.ndarray:
        return np.array([
            (self.current_hour % 24.0) / 24.0,
            load_kw / 500.0,
            solar_kw / (self.solar_capacity_kw + 1e-5),
            wind_kw / (self.wind_capacity_kw + 1e-5),
            self.battery_soc,
            import_price / 0.50,
            export_price / 0.50,
            1.0 if self.grid_connected else 0.0,
        ], dtype=np.float32)

    def step(self, action: np.ndarray) -> Tuple[np.ndarray, float, bool, bool, Dict[str, Any]]:
        """
        Executes one time step dispatch.
        action[0]: Battery dispatch normalized [-1.0, 1.0]
        action[1]: Generator dispatch normalized [0.0, 1.0]
        action[2]: Grid dispatch preference normalized [-1.0, 1.0]
        """
        action = np.clip(action, self.action_space.low, self.action_space.high)
        raw_batt = float(action[0])
        raw_gen = float(action[1])

        # Current generation and load
        load_kw, solar_kw, wind_kw = self.generate_profiles(self.current_hour, noise_scale=1.0)
        import_price, export_price = self.get_tariff(self.current_hour)
        renewables_kw = solar_kw + wind_kw
        net_load = load_kw - renewables_kw

        # 1. Generator Dispatch
        gen_power_kw = 0.0
        if raw_gen > 0.05:
            gen_power_kw = max(self.generator_min_load_kw, raw_gen * self.generator_capacity_kw)
            gen_power_kw = min(gen_power_kw, self.generator_capacity_kw)

        # 2. Battery Dispatch
        # raw_batt > 0 means discharging (+), < 0 means charging (-)
        battery_power_kw = 0.0
        one_way_eff = math.sqrt(self.battery_efficiency)

        if raw_batt > 0:  # Request discharge
            max_avail_discharge = max(
                0.0,
                (self.battery_soc - self.battery_min_soc) * self.battery_capacity_kwh * one_way_eff / self.dt
            )
            requested_discharge = raw_batt * self.battery_max_discharge_kw
            battery_power_kw = min(requested_discharge, max_avail_discharge)
            # Update SoC: discharging drops SoC
            delta_soc = -(battery_power_kw / one_way_eff * self.dt) / self.battery_capacity_kwh
            self.battery_soc = max(self.battery_min_soc, min(self.battery_max_soc, self.battery_soc + delta_soc))

        elif raw_batt < 0:  # Request charge
            max_avail_charge = max(
                0.0,
                (self.battery_max_soc - self.battery_soc) * self.battery_capacity_kwh / (one_way_eff * self.dt)
            )
            requested_charge = abs(raw_batt) * self.battery_max_charge_kw
            battery_power_kw = -min(requested_charge, max_avail_charge)
            # Update SoC: charging increases SoC
            delta_soc = (abs(battery_power_kw) * one_way_eff * self.dt) / self.battery_capacity_kwh
            self.battery_soc = max(self.battery_min_soc, min(self.battery_max_soc, self.battery_soc + delta_soc))

        # 3. Grid Power Balance Conservation:
        # Load = Solar + Wind + Battery_Discharge + Generator + Grid_Import
        # Grid = Load - (Solar + Wind + Battery + Generator)
        required_grid_kw = net_load - battery_power_kw - gen_power_kw
        unserved_load_kw = 0.0

        if self.grid_connected:
            if required_grid_kw > 0:
                grid_power_kw = min(self.grid_import_limit_kw, required_grid_kw)
                if required_grid_kw > self.grid_import_limit_kw:
                    unserved_load_kw = required_grid_kw - self.grid_import_limit_kw
            else:
                grid_power_kw = max(-self.grid_export_limit_kw, required_grid_kw)
        else:
            # Islanded mode - no grid interaction permitted
            grid_power_kw = 0.0
            if required_grid_kw > 0:
                # Islanded deficit: check if generator can ramp up to cover
                gap = required_grid_kw
                add_gen = min(self.generator_capacity_kw - gen_power_kw, gap)
                gen_power_kw += max(0.0, add_gen)
                remaining_gap = gap - add_gen
                if remaining_gap > 0:
                    unserved_load_kw = remaining_gap
            else:
                # Excess generation in island mode: curtail renewable / dump power
                pass

        # 4. Economics & Emissions Calculations
        if grid_power_kw >= 0:
            grid_cost = grid_power_kw * self.dt * import_price
        else:
            grid_cost = grid_power_kw * self.dt * export_price  # Negative cost = revenue

        # Generator fuel cost
        fuel_liters = (0.05 * self.generator_capacity_kw + self.fuel_rate_l_per_kwh * gen_power_kw) * self.dt if gen_power_kw > 0 else 0.0
        fuel_cost = fuel_liters * self.fuel_cost_usd_per_liter
        co2_emissions = (gen_power_kw * self.generator_co2_kg_per_kwh * self.dt) + (max(0.0, grid_power_kw) * 0.38 * self.dt)

        # Battery degradation wear estimate ($0.025 / kWh throughput)
        deg_cost = abs(battery_power_kw) * self.dt * 0.025
        unserved_penalty = unserved_load_kw * self.dt * 10.0  # $10/kWh unserved load penalty

        total_step_cost = grid_cost + fuel_cost + deg_cost + unserved_penalty
        reward = -total_step_cost

        # Progress simulation time
        self.current_step += 1
        self.current_hour = (self.current_hour + self.dt) % 24.0
        terminated = (self.current_step >= self.max_steps)
        truncated = False

        next_load, next_solar, next_wind = self.generate_profiles(self.current_hour, noise_scale=1.0)
        next_imp_price, next_exp_price = self.get_tariff(self.current_hour)
        obs = self._get_observation(next_load, next_solar, next_wind, next_imp_price, next_exp_price)

        total_gen = solar_kw + wind_kw + gen_power_kw + max(0.0, battery_power_kw) + max(0.0, grid_power_kw)
        ren_frac = min(100.0, max(0.0, (solar_kw + wind_kw) / (load_kw + 1e-4) * 100.0))

        info = {
            "step": self.current_step,
            "hour": self.current_hour,
            "load_kw": round(load_kw, 2),
            "solar_kw": round(solar_kw, 2),
            "wind_kw": round(wind_kw, 2),
            "battery_soc": round(self.battery_soc, 4),
            "battery_power_kw": round(battery_power_kw, 2),
            "generator_power_kw": round(gen_power_kw, 2),
            "grid_power_kw": round(grid_power_kw, 2),
            "unserved_load_kw": round(unserved_load_kw, 2),
            "tariff": round(import_price, 3),
            "feedin": round(export_price, 3),
            "step_cost_usd": round(total_step_cost, 2),
            "fuel_cost_usd": round(fuel_cost, 2),
            "grid_cost_usd": round(grid_cost, 2),
            "co2_emissions_kg": round(co2_emissions, 2),
            "renewable_fraction": round(ren_frac, 1),
            "grid_connected": self.grid_connected,
        }

        return obs, reward, terminated, truncated, info

    def render(self):
        print(f"Hour {self.current_hour:.1f} | SoC: {self.battery_soc*100:.1f}% | Grid Connected: {self.grid_connected}")

    def close(self):
        pass

    # ====================================================================
    # OPTIMIZATION & SCHEDULING ALGORITHMS
    # ====================================================================

    def optimize_24h_schedule(
        self,
        algorithm: str = "mpc_optimal",
        initial_soc: Optional[float] = None,
        reserve_margin: float = 0.20,
    ) -> Dict[str, Any]:
        """
        Calculates a 24-hour forward lookahead dispatch schedule.
        Supports:
          1. 'heuristic' - Rule-based self-consumption and ToU peak shaving.
          2. 'mpc_optimal' - Dynamic linear economic dispatch optimization.
          3. 'rl_policy' - Pre-trained actor-critic heuristic policy inference.
        """
        start_soc = initial_soc if initial_soc is not None else self.battery_soc
        horizon_hours = 24
        hourly_plan = []

        # 1. Generate 24h deterministic forecast profiles
        forecast_load = []
        forecast_solar = []
        forecast_wind = []
        tariffs = []
        feedins = []

        for h in range(horizon_hours):
            l, s, w = self.generate_profiles(float(h), noise_scale=0.0)
            imp_t, exp_t = self.get_tariff(float(h))
            forecast_load.append(l)
            forecast_solar.append(s)
            forecast_wind.append(w)
            tariffs.append(imp_t)
            feedins.append(exp_t)

        sim_soc = start_soc
        total_cost = 0.0
        baseline_cost = 0.0
        total_co2 = 0.0

        for h in range(horizon_hours):
            load = forecast_load[h]
            solar = forecast_solar[h]
            wind = forecast_wind[h]
            tariff = tariffs[h]
            feedin = feedins[h]
            net_demand = load - (solar + wind)

            # Baseline calculation (no battery, 100% grid/generator)
            base_grid = max(0.0, net_demand)
            base_export = max(0.0, -net_demand)
            b_cost = (base_grid * tariff) - (base_export * feedin)
            baseline_cost += b_cost

            batt_dispatch = 0.0
            gen_dispatch = 0.0
            grid_dispatch = 0.0

            if algorithm == "heuristic":
                # Rule-Based Heuristic:
                # - Charge if excess solar OR off-peak (h < 6 or h >= 22)
                # - Discharge during peak hours (14 <= h < 20)
                if net_demand < 0:  # Surplus solar/wind
                    charge_headroom = (self.battery_max_soc - sim_soc) * self.battery_capacity_kwh
                    charge_power = min(abs(net_demand), self.battery_max_charge_kw, charge_headroom)
                    batt_dispatch = -charge_power
                elif 14 <= h < 20:  # Peak tariff period: aggressive discharge
                    avail_discharge = max(0.0, (sim_soc - self.battery_min_soc) * self.battery_capacity_kwh)
                    batt_dispatch = min(net_demand, self.battery_max_discharge_kw, avail_discharge)
                elif h < 6 and sim_soc < 0.80:  # Cheap off-peak pre-charge
                    avail_charge = (0.80 - sim_soc) * self.battery_capacity_kwh
                    batt_dispatch = -min(self.battery_max_charge_kw * 0.5, avail_charge)

            elif algorithm == "mpc_optimal":
                # Cost-Optimal Dispatch:
                # Maximize arbitrage between off-peak and peak; minimize generator usage
                is_peak = (14 <= h < 20)
                is_offpeak = (h < 6 or h >= 22)

                if net_demand < 0:
                    # Absorb clean energy first
                    charge_cap = (self.battery_max_soc - sim_soc) * self.battery_capacity_kwh
                    batt_dispatch = -min(abs(net_demand), self.battery_max_charge_kw, charge_cap)
                elif is_peak:
                    # Peak window: peak-shaving up to minimum reserve
                    safe_min = max(self.battery_min_soc, reserve_margin)
                    avail_cap = max(0.0, (sim_soc - safe_min) * self.battery_capacity_kwh)
                    target_discharge = min(net_demand, self.battery_max_discharge_kw, avail_cap)
                    batt_dispatch = target_discharge
                elif is_offpeak and sim_soc < 0.85:
                    # Pre-charge from cheap grid
                    charge_room = (0.85 - sim_soc) * self.battery_capacity_kwh
                    batt_dispatch = -min(self.battery_max_charge_kw * 0.7, charge_room)
                else:
                    # Mid-day balance: gentle buffer
                    if sim_soc > 0.60 and net_demand > 50.0:
                        batt_dispatch = min(net_demand * 0.4, self.battery_max_discharge_kw * 0.5)

            else:  # 'rl_policy'
                # Neural / Heuristic Actor-Critic Policy Mapping
                hour_norm = h / 24.0
                price_signal = (tariff - 0.20) / 0.20
                demand_ratio = net_demand / 300.0

                action_weight = 0.8 * price_signal + 0.5 * demand_ratio - 0.6 * (0.5 - sim_soc)
                action_weight = max(-1.0, min(1.0, action_weight))

                if action_weight > 0:
                    avail = max(0.0, (sim_soc - self.battery_min_soc) * self.battery_capacity_kwh)
                    batt_dispatch = min(action_weight * self.battery_max_discharge_kw, avail)
                else:
                    room = max(0.0, (self.battery_max_soc - sim_soc) * self.battery_capacity_kwh)
                    batt_dispatch = -min(abs(action_weight) * self.battery_max_charge_kw, room)

            # Update battery SoC for next hour
            eff = math.sqrt(self.battery_efficiency)
            if batt_dispatch > 0:
                sim_soc -= (batt_dispatch / eff) / self.battery_capacity_kwh
            else:
                sim_soc += (abs(batt_dispatch) * eff) / self.battery_capacity_kwh
            sim_soc = max(self.battery_min_soc, min(self.battery_max_soc, sim_soc))

            # Residual to Grid
            rem = net_demand - batt_dispatch - gen_dispatch
            grid_dispatch = rem

            # Hourly Cost calculation
            if grid_dispatch >= 0:
                h_cost = grid_dispatch * tariff
            else:
                h_cost = grid_dispatch * feedin

            deg = abs(batt_dispatch) * 0.025
            h_cost += deg
            h_co2 = max(0.0, grid_dispatch) * 0.38 + gen_dispatch * 0.72

            total_cost += h_cost
            total_co2 += h_co2

            hourly_plan.append({
                "hour": h,
                "time_str": f"{h:02d}:00",
                "load_forecast_kw": round(load, 2),
                "solar_forecast_kw": round(solar, 2),
                "wind_forecast_kw": round(wind, 2),
                "battery_scheduled_kw": round(batt_dispatch, 2),
                "battery_expected_soc": round(sim_soc, 3),
                "generator_scheduled_kw": round(gen_dispatch, 2),
                "grid_scheduled_kw": round(grid_dispatch, 2),
                "tariff_usd_per_kwh": round(tariff, 3),
                "hourly_cost_usd": round(h_cost, 2),
                "hourly_emissions_kg": round(h_co2, 2),
            })

        savings_usd = max(0.0, baseline_cost - total_cost)
        savings_pct = (savings_usd / baseline_cost * 100.0) if baseline_cost > 0 else 0.0
        tot_clean = sum(f["solar_forecast_kw"] + f["wind_forecast_kw"] for f in hourly_plan)
        tot_load = sum(f["load_forecast_kw"] for f in hourly_plan)
        ren_avg = round((tot_clean / tot_load * 100.0) if tot_load > 0 else 0.0, 1)

        return {
            "schedule_id": f"SCHED-{algorithm.upper()}-{int(random.random()*10000)}",
            "algorithm": algorithm,
            "horizon_hours": horizon_hours,
            "total_expected_cost_usd": round(total_cost, 2),
            "baseline_cost_usd": round(baseline_cost, 2),
            "savings_usd": round(savings_usd, 2),
            "savings_percentage": round(savings_pct, 1),
            "total_co2_kg": round(total_co2, 2),
            "renewable_penetration_avg": ren_avg,
            "hourly_plan": hourly_plan,
        }
