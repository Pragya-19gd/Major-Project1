from pydantic import BaseModel
from datetime import datetime

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
    algorithm: str

class TelemetryPayload(BaseModel):
    timestamp: datetime
    step: int
    metrics: TelemetryMetrics