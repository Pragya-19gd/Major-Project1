# ⚡ Microgrid Energy Scheduling & Real-Time Telemetry System

A production-grade, full-stack Microgrid SCADA Energy Management System featuring physical DER simulation, Gym-compatible Reinforcement Learning / MPC optimization environment, high-frequency FastAPI WebSocket telemetry broadcasting, TimescaleDB/PostgreSQL time-series storage, and a modern React 18 + TypeScript industrial dashboard.

![Microgrid SCADA Architecture](https://img.shields.io/badge/Architecture-FastAPI%20%7C%20React%2018%20%7C%20TimescaleDB-10b981?style=for-the-badge)
![Status](https://img.shields.io/badge/Status-Production%20Grade-blue?style=for-the-badge)
![Python](https://img.shields.io/badge/Python-3.11+-yellow?style=for-the-badge&logo=python)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178c6?style=for-the-badge&logo=typescript)

---

## 🏗️ System Architecture

```text
microgrid-energy-scheduling/
├── docker-compose.yml              # Multi-container orchestration (TimescaleDB, Backend, Frontend)
├── .gitignore                      # Git exclusion rules
├── start.sh                        # Linux/macOS launcher script
├── start.bat                       # Windows one-click launcher script
├── backend/
│   ├── Dockerfile                  # Container definition for FastAPI
│   ├── requirements.txt            # Python dependencies
│   ├── main.py                     # FastAPI application & WebSocket broadcaster
│   ├── test_microgrid.py           # Automated unit test suite (pytest)
│   ├── db/
│   │   └── init.sql                # TimescaleDB & PostgreSQL schema with seed data
│   ├── envs/
│   │   ├── __init__.py
│   │   └── microgrid_env.py        # Gym-compatible DER physical simulation & optimizer
│   └── schemas/
│       ├── __init__.py
│       └── telemetry.py            # Pydantic v2 data models
└── frontend/
    ├── Dockerfile                  # Production Nginx container
    ├── package.json                # Dependencies & scripts
    ├── tsconfig.json               # TypeScript config
    ├── vite.config.ts              # Vite dev server & proxy settings
    ├── index.html                  # HTML entry point with Plus Jakarta Sans & JetBrains Mono
    └── src/
        ├── main.tsx                # React DOM root
        ├── App.tsx                 # SCADA header, WebSocket connection & navigation
        ├── index.css               # Dark-mode industrial SCADA styling & animations
        ├── types/
        │   └── telemetry.ts        # TypeScript schemas
        └── components/
            └── Dashboard.tsx       # Live Power Flow SVG, 24h Optimizer, Controls & Alarms
```

---

## 🌟 Key Features

1. **Physical Microgrid Simulation (`MicrogridEnv`)**:
   - Diurnal solar irradiance models and stochastic cloud attenuation.
   - Weibull wind speed distribution and wind turbine power curves.
   - Dual-peak commercial & industrial load profiles.
   - Battery Energy Storage System (BESS) Coulomb counting, round-trip efficiency, and degradation wear modeling.
   - Time-of-Use (ToU) electricity tariffs (Peak: $0.38/kWh, Shoulder: $0.22/kWh, Off-Peak: $0.12/kWh).
   - Strict Kirchhoff power balance conservation ($\sum P_{gen} = P_{load}$).

2. **24-Hour Horizon Optimization Engines**:
   - **Cost-Optimal MPC**: Solves battery charge/discharge schedule to maximize tariff arbitrage and peak shaving.
   - **Solar Heuristic**: Maximizes on-site clean renewable self-consumption.
   - **RL Policy**: Continuous state-action actor-critic dispatch mapping.

3. **High-Performance Real-Time Telemetry**:
   - 1 Hz physical simulation stream broadcast via WebSockets (`/ws/telemetry`).
   - REST endpoints for live status, 24-hour lookahead forecasts, and historical time-series queries.
   - Dual database compatibility: automatic PostgreSQL/TimescaleDB connection or instant SQLite fallback.

4. **Industrial SCADA Web Interface**:
   - Animated SVG power flow diagram showing real-time flowing electricity dashes across all DERs.
   - Interactive 24-hour lookahead chart and hourly dispatch plan table.
   - Point of Common Coupling (PCC) islanding switch (Grid-Tied vs Standalone Islanded).
   - Manual override sliders for battery dispatch (kW) and backup generator (kW).
   - Active alarm incident stream with acknowledge/resolve workflow.

---

## 🚀 Quick Start Guide

### Option 1: One-Click Launch (Windows)
Double-click `start.bat` or run:
```cmd
start.bat
```

### Option 2: Linux / macOS / Bash
```bash
chmod +x start.sh
./start.sh
```

### Option 3: Docker Compose
```bash
docker compose up --build
```

### Access URLs
- **SCADA Web Dashboard**: [http://localhost:5173](http://localhost:5173)
- **FastAPI Telemetry API**: [http://localhost:8000](http://localhost:8000)
- **Interactive Swagger Docs**: [http://localhost:8000/docs](http://localhost:8000/docs)

---

## 🧪 Running Automated Tests

Run the test suite with `pytest`:
```bash
cd backend
python -m pytest test_microgrid.py -v
```

---

## 📄 License
MIT License.
