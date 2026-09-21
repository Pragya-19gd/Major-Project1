export interface MicrogridConfig {
  id: string;
  name: string;
  location: string;
  solar_capacity_kw: number;
  wind_capacity_kw: number;
  battery_capacity_kwh: number;
  battery_max_charge_kw: number;
  battery_max_discharge_kw: number;
  battery_min_soc: number;
  battery_max_soc: number;
  battery_roundtrip_efficiency: number;
  generator_capacity_kw: number;
  generator_min_load_kw: number;
  generator_fuel_rate_l_per_kwh: number;
  fuel_cost_usd_per_liter: number;
  generator_co2_kg_per_kwh: number;
  grid_import_limit_kw: number;
  grid_export_limit_kw: number;
  nominal_frequency_hz: number;
  nominal_voltage_v: number;
}

export interface TelemetrySnapshot {
  timestamp: string;
  microgrid_id: string;
  load_kw: number;
  solar_kw: number;
  wind_kw: number;
  battery_soc: number;
  battery_power_kw: number; // (+) Discharging, (-) Charging
  generator_power_kw: number;
  grid_power_kw: number; // (+) Importing, (-) Exporting
  net_power_balance_kw: number;
  grid_tariff_usd_per_kwh: number;
  grid_feedin_usd_per_kwh: number;
  system_frequency_hz: number;
  bus_voltage_v: number;
  net_cost_usd: number;
  carbon_emissions_kg: number;
  grid_connected: boolean;
  operational_mode: string;
  renewable_fraction: number;
  active_alarms_count: number;
}

export interface HistoricalDataPoint {
  timestamp: string;
  load_kw: number;
  solar_kw: number;
  wind_kw: number;
  battery_soc: number;
  battery_power_kw: number;
  generator_power_kw: number;
  grid_power_kw: number;
  grid_tariff_usd_per_kwh: number;
  net_cost_usd: number;
  carbon_emissions_kg: number;
}

export interface ForecastHour {
  hour: number;
  time_str: string;
  solar_kw: number;
  wind_kw: number;
  load_kw: number;
  tariff_usd_per_kwh: number;
  feedin_usd_per_kwh: number;
}

export interface ScheduleHourlyItem {
  hour: number;
  time_str: string;
  load_forecast_kw: number;
  solar_forecast_kw: number;
  wind_forecast_kw: number;
  battery_scheduled_kw: number;
  battery_expected_soc: number;
  generator_scheduled_kw: number;
  grid_scheduled_kw: number;
  tariff_usd_per_kwh: number;
  hourly_cost_usd: number;
  hourly_emissions_kg: number;
}

export interface SchedulePlan {
  schedule_id: string;
  algorithm: string;
  created_at: string;
  horizon_hours: number;
  total_expected_cost_usd: number;
  baseline_cost_usd: number;
  savings_usd: number;
  savings_percentage: number;
  total_co2_kg: number;
  renewable_penetration_avg: number;
  hourly_plan: ScheduleHourlyItem[];
}

export interface ControlOverrideRequest {
  operational_mode?: string;
  grid_connected?: boolean;
  manual_battery_kw?: number;
  manual_generator_kw?: number;
}

export interface AlertItem {
  id: number;
  timestamp: string;
  microgrid_id: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  source: 'BATTERY' | 'GENERATOR' | 'GRID' | 'LOAD' | 'INVERTER';
  message: string;
  metric_value?: number;
  resolved: boolean;
}

export interface SystemStatusResponse {
  status: string;
  uptime_seconds: number;
  mode: string;
  grid_status: string;
  health_score: number;
  solar_status: string;
  wind_status: string;
  battery_status: string;
  generator_status: string;
  today_solar_kwh: number;
  today_wind_kwh: number;
  today_consumed_kwh: number;
  today_cost_saved_usd: number;
  today_co2_avoided_kg: number;
}
