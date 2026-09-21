CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS simulation_runs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    algorithm VARCHAR(50) NOT NULL,
    total_steps INT DEFAULT 0,
    total_grid_cost NUMERIC(10, 4) DEFAULT 0.0,
    started_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS energy_telemetry_logs (
    id BIGSERIAL PRIMARY KEY,
    simulation_run_id UUID REFERENCES simulation_runs(id) ON DELETE CASCADE,
    step_index INT NOT NULL,
    solar_kw NUMERIC(8, 3),
    load_kw NUMERIC(8, 3),
    battery_power_kw NUMERIC(8, 3),
    battery_soc NUMERIC(4, 3),
    grid_import_kw NUMERIC(8, 3),
    grid_export_kw NUMERIC(8, 3),
    step_cost NUMERIC(10, 4),
    recorded_at TIMESTAMPTZ DEFAULT NOW()
);