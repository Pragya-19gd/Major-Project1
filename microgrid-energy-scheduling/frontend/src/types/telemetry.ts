export interface TelemetryMetrics {
  solar_kw: number;
  load_kw: number;
  soc: number; // 0.0 to 1.0 (State of Charge)
  battery_power_kw: number; // negative = charging, positive = discharging
  grid_import_kw: number;
  grid_export_kw: number;
  buy_price: number; // $/kWh
  sell_price: number; // $/kWh
  step_cost: number;
  cumulative_cost: number;
  baseline_cumulative_cost?: number;
  savings_amount?: number;
  savings_percent?: number;
  grid_available?: boolean;
  scenario?: string;
  algorithm: string;
}

export interface TelemetryPayload {
  timestamp: string;
  step: number;
  metrics: TelemetryMetrics;
}

export interface HistoryPoint extends TelemetryMetrics {
  timeLabel: string;
  step: number;
  netPower: number;
}

