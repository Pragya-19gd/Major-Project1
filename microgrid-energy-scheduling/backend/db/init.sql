-- ====================================================================
-- MICROGRID ENERGY SCHEDULING & REAL-TIME TELEMETRY SYSTEM SCHEMA
-- Compatible with PostgreSQL 15+ and TimescaleDB
-- ====================================================================

-- 1. Enable TimescaleDB extension if available
DO $$
BEGIN
    CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'TimescaleDB extension could not be loaded; continuing with standard PostgreSQL partitioning / tables.';
END $$;

-- 2. Microgrid Configuration Table
CREATE TABLE IF NOT EXISTS microgrid_config (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    location VARCHAR(255) DEFAULT 'Industrial Park Substation Alpha',
    solar_capacity_kw DOUBLE PRECISION NOT NULL DEFAULT 350.0,
    wind_capacity_kw DOUBLE PRECISION NOT NULL DEFAULT 150.0,
    battery_capacity_kwh DOUBLE PRECISION NOT NULL DEFAULT 600.0,
    battery_max_charge_kw DOUBLE PRECISION NOT NULL DEFAULT 250.0,
    battery_max_discharge_kw DOUBLE PRECISION NOT NULL DEFAULT 250.0,
    battery_min_soc DOUBLE PRECISION NOT NULL DEFAULT 0.15,
    battery_max_soc DOUBLE PRECISION NOT NULL DEFAULT 0.95,
    battery_roundtrip_efficiency DOUBLE PRECISION NOT NULL DEFAULT 0.92,
    generator_capacity_kw DOUBLE PRECISION NOT NULL DEFAULT 250.0,
    generator_min_load_kw DOUBLE PRECISION NOT NULL DEFAULT 40.0,
    generator_fuel_rate_l_per_kwh DOUBLE PRECISION NOT NULL DEFAULT 0.28,
    fuel_cost_usd_per_liter DOUBLE PRECISION NOT NULL DEFAULT 1.35,
    generator_co2_kg_per_kwh DOUBLE PRECISION NOT NULL DEFAULT 0.72,
    grid_import_limit_kw DOUBLE PRECISION NOT NULL DEFAULT 450.0,
    grid_export_limit_kw DOUBLE PRECISION NOT NULL DEFAULT 350.0,
    nominal_frequency_hz DOUBLE PRECISION NOT NULL DEFAULT 60.0,
    nominal_voltage_v DOUBLE PRECISION NOT NULL DEFAULT 480.0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 3. Telemetry Time-Series Logs Table
CREATE TABLE IF NOT EXISTS telemetry_logs (
    id BIGSERIAL,
    timestamp TIMESTAMPTZ NOT NULL,
    microgrid_id VARCHAR(64) NOT NULL DEFAULT 'MG-ALPHA-01',
    load_kw DOUBLE PRECISION NOT NULL,
    solar_kw DOUBLE PRECISION NOT NULL,
    wind_kw DOUBLE PRECISION NOT NULL,
    battery_soc DOUBLE PRECISION NOT NULL,
    battery_power_kw DOUBLE PRECISION NOT NULL, -- (+) Discharging, (-) Charging
    generator_power_kw DOUBLE PRECISION NOT NULL,
    grid_power_kw DOUBLE PRECISION NOT NULL,    -- (+) Importing, (-) Exporting
    grid_tariff_usd_per_kwh DOUBLE PRECISION NOT NULL,
    grid_feedin_usd_per_kwh DOUBLE PRECISION NOT NULL,
    system_frequency_hz DOUBLE PRECISION NOT NULL DEFAULT 60.0,
    bus_voltage_v DOUBLE PRECISION NOT NULL DEFAULT 480.0,
    net_cost_usd DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    carbon_emissions_kg DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    grid_connected BOOLEAN NOT NULL DEFAULT TRUE,
    operational_mode VARCHAR(32) NOT NULL DEFAULT 'AUTO_OPTIMAL',
    PRIMARY KEY (timestamp, id)
);

-- Convert to Hypertable if TimescaleDB is installed
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
        PERFORM create_hypertable('telemetry_logs', 'timestamp', if_not_exists => TRUE);
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Skipping create_hypertable; operating on standard SQL table.';
END $$;

CREATE INDEX IF NOT EXISTS idx_telemetry_timestamp ON telemetry_logs (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_telemetry_mg_time ON telemetry_logs (microgrid_id, timestamp DESC);

-- 4. Dispatch Schedules Table
CREATE TABLE IF NOT EXISTS schedules (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    microgrid_id VARCHAR(64) NOT NULL DEFAULT 'MG-ALPHA-01',
    horizon_start TIMESTAMPTZ NOT NULL,
    horizon_hours INTEGER NOT NULL DEFAULT 24,
    algorithm VARCHAR(64) NOT NULL, -- 'heuristic', 'mpc_optimal', 'rl_policy'
    total_expected_cost_usd DOUBLE PRECISION NOT NULL,
    total_emissions_kg DOUBLE PRECISION NOT NULL,
    savings_vs_baseline_usd DOUBLE PRECISION NOT NULL,
    schedule_data JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_schedules_created ON schedules (created_at DESC);

-- 5. System Alerts & Events Table
CREATE TABLE IF NOT EXISTS system_alerts (
    id BIGSERIAL PRIMARY KEY,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    microgrid_id VARCHAR(64) NOT NULL DEFAULT 'MG-ALPHA-01',
    severity VARCHAR(16) NOT NULL, -- 'INFO', 'WARNING', 'CRITICAL'
    source VARCHAR(32) NOT NULL,   -- 'BATTERY', 'GENERATOR', 'GRID', 'LOAD', 'INVERTER'
    message TEXT NOT NULL,
    metric_value DOUBLE PRECISION,
    resolved BOOLEAN NOT NULL DEFAULT FALSE,
    resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_alerts_timestamp ON system_alerts (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_resolved ON system_alerts (resolved, timestamp DESC);

-- ====================================================================
-- SEED INITIAL DATA
-- ====================================================================

-- Insert primary microgrid site configuration
INSERT INTO microgrid_config (
    id, name, location, solar_capacity_kw, wind_capacity_kw,
    battery_capacity_kwh, battery_max_charge_kw, battery_max_discharge_kw,
    battery_min_soc, battery_max_soc, battery_roundtrip_efficiency,
    generator_capacity_kw, generator_min_load_kw, generator_fuel_rate_l_per_kwh,
    fuel_cost_usd_per_liter, generator_co2_kg_per_kwh, grid_import_limit_kw,
    grid_export_limit_kw, nominal_frequency_hz, nominal_voltage_v, updated_at
) VALUES (
    'MG-ALPHA-01',
    'North Regional Microgrid SCADA',
    'Sector 7 Clean Tech Park',
    350.0, 150.0,
    600.0, 250.0, 250.0,
    0.15, 0.95, 0.92,
    250.0, 40.0, 0.28,
    1.35, 0.72, 450.0,
    350.0, 60.0, 480.0,
    CURRENT_TIMESTAMP
) ON CONFLICT (id) DO UPDATE SET updated_at = CURRENT_TIMESTAMP;

-- Insert initial sample alerts
INSERT INTO system_alerts (timestamp, microgrid_id, severity, source, message, metric_value, resolved)
VALUES 
    (CURRENT_TIMESTAMP - INTERVAL '3 hours', 'MG-ALPHA-01', 'INFO', 'INVERTER', 'Solar PV string 4 switched to maximum power point tracking mode.', 285.4, TRUE),
    (CURRENT_TIMESTAMP - INTERVAL '1 hour', 'MG-ALPHA-01', 'WARNING', 'GRID', 'Grid Time-of-Use tariff peak window commenced ($0.38/kWh). Initiating BESS peak shaving.', 0.38, FALSE),
    (CURRENT_TIMESTAMP - INTERVAL '20 minutes', 'MG-ALPHA-01', 'INFO', 'BATTERY', 'Battery state of charge balanced across 4 rack modules.', 0.72, TRUE);

-- Generate realistic 24 hours of historical baseline telemetry
INSERT INTO telemetry_logs (
    timestamp, microgrid_id, load_kw, solar_kw, wind_kw,
    battery_soc, battery_power_kw, generator_power_kw, grid_power_kw,
    grid_tariff_usd_per_kwh, grid_feedin_usd_per_kwh, system_frequency_hz,
    bus_voltage_v, net_cost_usd, carbon_emissions_kg, grid_connected, operational_mode
)
SELECT
    (CURRENT_TIMESTAMP - (i || ' hours')::INTERVAL) as timestamp,
    'MG-ALPHA-01' as microgrid_id,
    ROUND((220 + 90 * sin((24 - i) * 3.14159 / 12) + (random() * 20 - 10))::NUMERIC, 2) as load_kw,
    ROUND((GREATEST(0, 320 * sin((24 - i - 6) * 3.14159 / 12)) * (CASE WHEN (24 - i) BETWEEN 6 AND 18 THEN 1 ELSE 0 END) + (random() * 15))::NUMERIC, 2) as solar_kw,
    ROUND((60 + 40 * cos((24 - i) * 3.14159 / 8) + (random() * 20 - 10))::NUMERIC, 2) as wind_kw,
    ROUND((0.45 + 0.35 * sin((24 - i) * 3.14159 / 12))::NUMERIC, 3) as battery_soc,
    ROUND((CASE WHEN (24 - i) BETWEEN 14 AND 20 THEN 120.0 WHEN (24 - i) BETWEEN 10 AND 13 THEN -110.0 ELSE 0.0 END + (random() * 10 - 5))::NUMERIC, 2) as battery_power_kw,
    0.0 as generator_power_kw,
    ROUND((80 + 30 * sin((24 - i) * 3.14159 / 6))::NUMERIC, 2) as grid_power_kw,
    ROUND((CASE WHEN (24 - i) BETWEEN 14 AND 20 THEN 0.38 WHEN (24 - i) BETWEEN 7 AND 13 THEN 0.22 ELSE 0.12 END)::NUMERIC, 3) as grid_tariff_usd_per_kwh,
    ROUND((CASE WHEN (24 - i) BETWEEN 14 AND 20 THEN 0.18 WHEN (24 - i) BETWEEN 7 AND 13 THEN 0.10 ELSE 0.06 END)::NUMERIC, 3) as grid_feedin_usd_per_kwh,
    ROUND((60.0 + (random() * 0.08 - 0.04))::NUMERIC, 3) as system_frequency_hz,
    ROUND((480.0 + (random() * 3.0 - 1.5))::NUMERIC, 2) as bus_voltage_v,
    ROUND((12.50 + random() * 4.0)::NUMERIC, 2) as net_cost_usd,
    ROUND((35.0 + random() * 10.0)::NUMERIC, 2) as carbon_emissions_kg,
    TRUE as grid_connected,
    'AUTO_OPTIMAL' as operational_mode
FROM generate_series(24, 1, -1) as i;
