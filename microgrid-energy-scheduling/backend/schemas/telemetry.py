from pydantic import BaseModel
from datetime import datetime
from typing import Optional

class TelemetryMetrics(BaseModel):
    solar_kw: float
    load_kw: float
    soc: float
    battery_power_kw: float
    grid_import_kw: float
    grid_export_kw: float
    buy_price: float
    sell_price: float
    step_cost: float
    cumulative_cost: float
    baseline_cumulative_cost: Optional[float] = 0.0
    savings_amount: Optional[float] = 0.0
    savings_percent: Optional[float] = 0.0
    grid_available: Optional[bool] = True
    scenario: Optional[str] = "normal"
    algorithm: str

class TelemetryPayload(BaseModel):
    timestamp: datetime
    step: int
    metrics: TelemetryMetrics