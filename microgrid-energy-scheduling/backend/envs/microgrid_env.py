import math
import numpy as np
import gymnasium as gym
from gymnasium import spaces

class MicrogridEnv(gym.Env):
    """
    OpenAI Gymnasium Microgrid Energy Scheduling Environment.
    Simulates solar PV generation, load demand, battery storage, dynamic TOU tariffs,
    and scenario testing (blackouts, peak demand surges, cloudy weather).
    """
    metadata = {"render_modes": ["human"]}

    def __init__(self, max_steps: int = 24, scenario: str = "normal"):
        super().__init__()
        
        self.max_steps = max_steps
        self.current_step = 0
        self.scenario = scenario
        
        # Physical Parameters
        self.battery_capacity_kwh = 10.0
        self.max_charge_kw = 3.0
        self.max_discharge_kw = 3.0
        self.soc_min = 0.20
        self.soc_max = 0.90
        self.battery_efficiency = 0.95
        
        self.solar_peak_kw = 6.0
        self.base_load_kw = 1.5
        
        # State: [solar_kw, load_kw, soc, buy_price, sell_price, hour_of_day]
        self.observation_space = spaces.Box(
            low=np.array([0.0, 0.0, 0.0, 0.0, 0.0, 0.0], dtype=np.float32),
            high=np.array([10.0, 15.0, 1.0, 1.0, 1.0, 24.0], dtype=np.float32),
            dtype=np.float32
        )
        
        # Action space: 5 discrete actions
        self.action_space = spaces.Discrete(5)
        self.action_map = {
            0: -3.0, # Negative = Charging battery
            1: -1.5,
            2: 0.0,
            3: 1.5,  # Positive = Discharging battery
            4: 3.0
        }
        
        self.soc = 0.50 # Initial 50% SOC
        self.cumulative_cost = 0.0
        self.baseline_cumulative_cost = 0.0 # Unmanaged baseline (no battery smart dispatch)

    def set_scenario(self, scenario: str):
        self.scenario = scenario

    def _get_solar_power(self, hour: float) -> float:
        """Simulate diurnal solar PV output peaking at hour 12 (noon)."""
        if 6.0 <= hour <= 18.0:
            solar = self.solar_peak_kw * math.sin(math.pi * (hour - 6.0) / 12.0)
            solar += np.random.normal(0, 0.15)
            solar = float(max(0.0, solar))
            if self.scenario == "cloudy":
                solar *= 0.25 # 75% reduction on cloudy days
            return solar
        return 0.0

    def _get_load_power(self, hour: float) -> float:
        """Simulate facility load curve with morning and evening peaks."""
        morning_peak = 2.0 * math.exp(-0.5 * ((hour - 8.0) / 1.5) ** 2)
        evening_peak = 3.5 * math.exp(-0.5 * ((hour - 19.0) / 2.0) ** 2)
        noise = np.random.normal(0, 0.1)
        load = self.base_load_kw + morning_peak + evening_peak + noise
        
        if self.scenario == "peak_surge" and 17.0 <= hour <= 21.0:
            load *= 1.85 # 85% load spike during peak surge
            
        return float(max(0.5, load))

    def _get_tou_prices(self, hour: float):
        """Dynamic Time-Of-Use (TOU) electricity pricing tariff."""
        if 16.0 <= hour < 21.0:
            buy_price = 0.35
            sell_price = 0.18
        elif 23.0 <= hour or hour < 6.0:
            buy_price = 0.08
            sell_price = 0.04
        else:
            buy_price = 0.16
            sell_price = 0.09
        return buy_price, sell_price

    def _is_grid_available(self, hour: float) -> bool:
        if self.scenario == "blackout" and 17.0 <= hour <= 21.0:
            return False # Grid blackout between 17:00 and 21:00
        return True

    def _get_obs(self):
        hour = float(self.current_step % 24)
        solar = self._get_solar_power(hour)
        load = self._get_load_power(hour)
        buy_price, sell_price = self._get_tou_prices(hour)
        return np.array([solar, load, self.soc, buy_price, sell_price, hour], dtype=np.float32)

    def reset(self, seed=None, options=None):
        super().reset(seed=seed)
        self.current_step = 0
        self.soc = 0.50
        self.cumulative_cost = 0.0
        self.baseline_cumulative_cost = 0.0
        obs = self._get_obs()
        return obs, {}

    def step(self, action: int):
        hour = float(self.current_step % 24)
        solar = self._get_solar_power(hour)
        load = self._get_load_power(hour)
        buy_price, sell_price = self._get_tou_prices(hour)
        grid_available = self._is_grid_available(hour)
        
        requested_battery_kw = self.action_map[action]
        actual_battery_kw = requested_battery_kw
        
        if requested_battery_kw < 0:
            # Charging: cannot exceed soc_max
            max_charge_possible = (self.soc_max - self.soc) * self.battery_capacity_kwh / self.battery_efficiency
            actual_battery_kw = -min(abs(requested_battery_kw), max_charge_possible)
        elif requested_battery_kw > 0:
            # Discharging: cannot drop below soc_min
            max_discharge_possible = (self.soc - self.soc_min) * self.battery_capacity_kwh * self.battery_efficiency
            actual_battery_kw = min(requested_battery_kw, max_discharge_possible)
            
        # Update SOC
        energy_delta_kwh = -actual_battery_kw * 1.0 # 1 hour step
        if actual_battery_kw < 0:
            self.soc += (energy_delta_kwh * self.battery_efficiency) / self.battery_capacity_kwh
        else:
            self.soc -= (actual_battery_kw / self.battery_efficiency) / self.battery_capacity_kwh
        self.soc = float(np.clip(self.soc, self.soc_min, self.soc_max))
        
        # Calculate net grid power balance for RL Agent
        # Net Load = Load + Battery Charging - Solar Generation
        net_power = load - actual_battery_kw - solar
        
        blackout_penalty = 0.0
        if not grid_available and net_power > 0:
            # Blackout deficit penalty when load cannot be met
            grid_import_kw = 0.0
            grid_export_kw = 0.0
            unmet_load_kw = net_power
            step_cost = unmet_load_kw * 1.50 # High outage penalty rate
            blackout_penalty = unmet_load_kw * 2.0
        elif net_power > 0:
            grid_import_kw = net_power
            grid_export_kw = 0.0
            unmet_load_kw = 0.0
            step_cost = grid_import_kw * buy_price
        else:
            grid_import_kw = 0.0
            grid_export_kw = abs(net_power)
            unmet_load_kw = 0.0
            step_cost = -grid_export_kw * sell_price # Revenue earned
            
        self.cumulative_cost += step_cost

        # Calculate Unmanaged Baseline step cost (Baseline does not use battery at all)
        baseline_net_power = load - solar
        if not grid_available and baseline_net_power > 0:
            baseline_step_cost = baseline_net_power * 1.50
        elif baseline_net_power > 0:
            baseline_step_cost = baseline_net_power * buy_price
        else:
            baseline_step_cost = -abs(baseline_net_power) * sell_price
            
        self.baseline_cumulative_cost += baseline_step_cost
        
        # Savings calculation vs baseline
        savings_amount = self.baseline_cumulative_cost - self.cumulative_cost
        savings_percent = (savings_amount / max(0.01, abs(self.baseline_cumulative_cost))) * 100.0 if self.baseline_cumulative_cost > 0 else 0.0
        
        # Reward function: negative cost minus battery degradation and blackout penalties
        degradation_penalty = 0.005 * abs(actual_battery_kw)
        reward = -(step_cost + degradation_penalty + blackout_penalty)
        
        self.current_step += 1
        terminated = self.current_step >= self.max_steps
        truncated = False
        
        info = {
            "solar_kw": solar,
            "load_kw": load,
            "soc": self.soc,
            "battery_power_kw": actual_battery_kw,
            "grid_import_kw": grid_import_kw,
            "grid_export_kw": grid_export_kw,
            "buy_price": buy_price,
            "sell_price": sell_price,
            "step_cost": step_cost,
            "cumulative_cost": self.cumulative_cost,
            "baseline_cumulative_cost": self.baseline_cumulative_cost,
            "savings_amount": savings_amount,
            "savings_percent": savings_percent,
            "grid_available": grid_available,
            "unmet_load_kw": unmet_load_kw,
            "scenario": self.scenario
        }
        
        obs = self._get_obs()
        return obs, reward, terminated, truncated, info

