import asyncio
from datetime import datetime, timezone
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from schemas.telemetry import TelemetryPayload, TelemetryMetrics

app = FastAPI()

@app.websocket("/ws/simulation")
async def websocket_simulation(websocket: WebSocket):
    await websocket.accept()
    step = 0
    cumulative_cost = 0.0

    try:
        while True:
            # Construct the validated payload object
            payload = TelemetryPayload(
                timestamp=datetime.now(timezone.utc),
                step=step,
                metrics=TelemetryMetrics(
                    solar_kw=4.85,
                    load_kw=2.10,
                    soc=0.65,
                    battery_power_kw=-1.25,
                    grid_import_kw=0.0,
                    grid_export_kw=1.50,
                    buy_price=0.15,
                    sell_price=0.0975,
                    step_cost=-0.146,
                    cumulative_cost=round(cumulative_cost, 2),
                    algorithm="DQN"
                )
            )

            # Send typed JSON string down the socket
            await websocket.send_text(payload.model_dump_json())

            step += 1
            cumulative_cost += -0.146
            await asyncio.sleep(1.0) # 1 step per second
            
    except WebSocketDisconnect:
        print("Client disconnected")