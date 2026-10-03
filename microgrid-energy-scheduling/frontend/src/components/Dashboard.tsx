import React, { useState, useEffect } from 'react';
import {
  Battery,
  BatteryCharging,
  Zap,
  Power,
  AlertTriangle,
  Activity,
  Leaf,
  Sliders,
  Play,
  RotateCcw,
  CheckCircle2,
  Clock,
  Radio,
  BarChart3,
  ShieldCheck,
  Server
} from 'lucide-react';
import {
  TelemetrySnapshot,
  HistoricalDataPoint,
  ForecastHour,
  SchedulePlan,
  AlertItem,
  SystemStatusResponse,
  MicrogridConfig,
} from '../types/telemetry';

interface DashboardProps {
  telemetry: TelemetrySnapshot | null;
  historical: HistoricalDataPoint[];
  alerts: AlertItem[];
  systemStatus: SystemStatusResponse | null;
  config: MicrogridConfig | null;
  isConnected: boolean;
  onRefreshData: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({
  telemetry,
  historical,
  alerts,
  systemStatus,
  config,
  isConnected,
  onRefreshData,
}) => {
  // Scheduling & Optimization state
  const [selectedAlgo, setSelectedAlgo] = useState<'mpc_optimal' | 'heuristic' | 'rl_policy'>('mpc_optimal');
  const [schedulePlan, setSchedulePlan] = useState<SchedulePlan | null>(null);
  const [isOptimizing, setIsOptimizing] = useState<boolean>(false);
  const [forecast, setForecast] = useState<ForecastHour[]>([]);

  // Manual Controls state
  const [manualMode, setManualMode] = useState<boolean>(false);
  const [manualBattKw, setManualBattKw] = useState<number>(0);
  const [manualGenKw, setManualGenKw] = useState<number>(0);
  const [isIslanded, setIsIslanded] = useState<boolean>(false);
  const [controlFeedback, setControlFeedback] = useState<string | null>(null);

  // Active Tab
  const [activeTab, setActiveTab] = useState<'overview' | 'scheduler' | 'controls' | 'alarms'>('overview');

  // Fetch initial forecast and schedule plan
  useEffect(() => {
    fetchForecastAndSchedule();
  }, []);

  useEffect(() => {
    if (telemetry) {
      setIsIslanded(!telemetry.grid_connected);
      if (telemetry.operational_mode === 'MANUAL_OVERRIDE') {
        setManualMode(true);
      }
    }
  }, [telemetry]);

  const fetchForecastAndSchedule = async () => {
    try {
      const forecastRes = await fetch('/api/forecast/24h');
      if (forecastRes.ok) {
        const forecastData = await forecastRes.json();
        setForecast(forecastData);
      }

      // Initial optimization run
      handleRunOptimization('mpc_optimal');
    } catch (err) {
      console.error('Failed to load forecast data', err);
    }
  };

  const handleRunOptimization = async (algo = selectedAlgo) => {
    setIsOptimizing(true);
    try {
      const res = await fetch('/api/schedule/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          microgrid_id: 'MG-ALPHA-01',
          horizon_hours: 24,
          algorithm: algo,
          reserve_margin_percent: 20.0,
        }),
      });
      if (res.ok) {
        const plan: SchedulePlan = await res.json();
        setSchedulePlan(plan);
      }
    } catch (err) {
      console.error('Failed to run optimization', err);
    } finally {
      setIsOptimizing(false);
    }
  };

  const handleApplyOverrides = async (overrideGrid = isIslanded, batt = manualBattKw, gen = manualGenKw) => {
    try {
      setControlFeedback('Sending command to microgrid controller...');
      const res = await fetch('/api/control/override', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grid_connected: !overrideGrid,
          operational_mode: manualMode ? 'MANUAL_OVERRIDE' : (overrideGrid ? 'ISLANDED' : 'AUTO_OPTIMAL'),
          manual_battery_kw: manualMode ? batt : null,
          manual_generator_kw: manualMode ? gen : null,
        }),
      });
      if (res.ok) {
        setControlFeedback('Command acknowledged and verified by SCADA PLC.');
        setTimeout(() => setControlFeedback(null), 4000);
        onRefreshData();
      }
    } catch (err) {
      setControlFeedback('Error: Command rejected by microgrid controller.');
    }
  };

  const handleResolveAlert = async (id: number) => {
    try {
      await fetch(`/api/alerts/${id}/resolve`, { method: 'POST' });
      onRefreshData();
    } catch (err) {
      console.error('Failed to resolve alert', err);
    }
  };

  // Safe fallback telemetry values
  const t = telemetry || {
    load_kw: 240.5,
    solar_kw: 185.2,
    wind_kw: 62.4,
    battery_soc: 0.68,
    battery_power_kw: -45.0,
    generator_power_kw: 0.0,
    grid_power_kw: 37.9,
    net_power_balance_kw: 0.0,
    grid_tariff_usd_per_kwh: 0.22,
    grid_feedin_usd_per_kwh: 0.10,
    system_frequency_hz: 60.01,
    bus_voltage_v: 480.2,
    net_cost_usd: 8.34,
    carbon_emissions_kg: 14.4,
    grid_connected: true,
    operational_mode: 'AUTO_OPTIMAL',
    renewable_fraction: 65.4,
    active_alarms_count: 1,
    timestamp: new Date().toISOString(),
    microgrid_id: 'MG-ALPHA-01',
  };

  const totalRenewables = t.solar_kw + t.wind_kw;
  const isBatteryDischarging = t.battery_power_kw > 0;
  const isBatteryCharging = t.battery_power_kw < 0;
  const isGridImporting = t.grid_power_kw > 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      
      {/* 1. TOP STATS & SCADA HUD */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
        
        {/* Total Load */}
        <div className="scada-card" style={{ borderLeft: '4px solid var(--load-emerald)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <span className="hud-label">Facility Load Demand</span>
            <Activity size={18} color="var(--load-emerald)" />
          </div>
          <div className="hud-value">
            {t.load_kw.toFixed(1)} <span className="hud-unit">kW</span>
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
            Baseload: 180 kW | Peak: 380 kW
          </div>
        </div>

        {/* Clean Renewable Share */}
        <div className="scada-card" style={{ borderLeft: '4px solid var(--solar-amber)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <span className="hud-label">Renewable Generation</span>
            <Leaf size={18} color="var(--solar-amber)" />
          </div>
          <div className="hud-value">
            {totalRenewables.toFixed(1)} <span className="hud-unit">kW</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.35rem' }}>
            <span style={{ fontSize: '0.75rem', color: '#10b981', fontWeight: 600 }}>
              {t.renewable_fraction.toFixed(1)}% Clean Share
            </span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              (PV: {t.solar_kw.toFixed(0)} | Wind: {t.wind_kw.toFixed(0)})
            </span>
          </div>
        </div>

        {/* Battery Storage */}
        <div className="scada-card" style={{ borderLeft: '4px solid var(--battery-violet)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <span className="hud-label">BESS Energy Storage</span>
            {isBatteryCharging ? (
              <BatteryCharging size={18} color="var(--battery-violet)" />
            ) : (
              <Battery size={18} color="var(--battery-violet)" />
            )}
          </div>
          <div className="hud-value">
            {(t.battery_soc * 100).toFixed(1)} <span className="hud-unit">% SoC</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.35rem' }}>
            <span style={{
              fontSize: '0.75rem',
              fontWeight: 600,
              color: isBatteryDischarging ? '#f59e0b' : (isBatteryCharging ? '#10b981' : 'var(--text-muted)')
            }}>
              {isBatteryDischarging ? `Discharging: +${t.battery_power_kw.toFixed(1)} kW` : 
               isBatteryCharging ? `Charging: ${t.battery_power_kw.toFixed(1)} kW` : 'Idle Standby'}
            </span>
          </div>
        </div>

        {/* Grid Interconnect / PCC */}
        <div className="scada-card" style={{ borderLeft: '4px solid var(--grid-blue)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <span className="hud-label">Grid Interconnect (PCC)</span>
            <Power size={18} color="var(--grid-blue)" />
          </div>
          <div className="hud-value">
            {Math.abs(t.grid_power_kw).toFixed(1)}{' '}
            <span className="hud-unit">{t.grid_power_kw >= 0 ? 'kW Imp' : 'kW Exp'}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginTop: '0.35rem' }}>
            <span style={{ color: 'var(--text-secondary)' }}>
              Tariff: ${(t.grid_tariff_usd_per_kwh).toFixed(3)}/kWh
            </span>
            <span className={`status-pill ${t.grid_connected ? 'online' : 'islanded'}`} style={{ padding: '0.1rem 0.4rem', fontSize: '0.65rem' }}>
              {t.grid_connected ? 'Tied' : 'Islanded'}
            </span>
          </div>
        </div>

        {/* Power Quality & Financials */}
        <div className="scada-card" style={{ borderLeft: '4px solid #8b5cf6' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <span className="hud-label">Power Quality & Rate</span>
            <Radio size={18} color="#8b5cf6" />
          </div>
          <div className="hud-value" style={{ fontSize: '1.45rem' }}>
            {t.system_frequency_hz.toFixed(2)} <span className="hud-unit">Hz</span> / {t.bus_voltage_v.toFixed(1)} <span className="hud-unit">V</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
            <span>Rate: ${t.net_cost_usd.toFixed(2)}/hr</span>
            <span>CO2: {t.carbon_emissions_kg.toFixed(1)} kg/hr</span>
          </div>
        </div>

      </div>

      {/* System Health Sub-Header Banner */}
      {systemStatus && (
        <div className="scada-card" style={{ padding: '0.75rem 1.25rem', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', background: 'rgba(17, 24, 39, 0.6)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', color: '#10b981' }}>
              <ShieldCheck size={16} />
              <span>Health Score: <strong>{systemStatus.health_score}%</strong></span>
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              Uptime: <strong>{(systemStatus.uptime_seconds / 3600).toFixed(1)} hrs</strong>
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              Site: <strong>{config?.name || 'North Regional Microgrid'}</strong>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', fontSize: '0.8rem' }}>
            <span style={{ color: '#38bdf8' }}>Today Saved: <strong>${systemStatus.today_cost_saved_usd.toFixed(2)}</strong></span>
            <span style={{ color: '#34d399' }}>CO2 Abated: <strong>{systemStatus.today_co2_avoided_kg.toFixed(1)} kg</strong></span>
            <span style={{ color: isConnected ? '#10b981' : '#f59e0b' }}>SCADA PLC: <strong>{isConnected ? 'LIVE' : 'POLLING'}</strong></span>
          </div>
        </div>
      )}

      {/* 2. NAVIGATION TABS */}
      <div style={{ display: 'flex', gap: '0.75rem', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.75rem' }}>
        <button
          className={`scada-btn ${activeTab === 'overview' ? 'scada-btn-primary' : 'scada-btn-secondary'}`}
          onClick={() => setActiveTab('overview')}
        >
          <Zap size={16} /> Live Power Flow & Telemetry
        </button>
        <button
          className={`scada-btn ${activeTab === 'scheduler' ? 'scada-btn-primary' : 'scada-btn-secondary'}`}
          onClick={() => setActiveTab('scheduler')}
        >
          <Clock size={16} /> 24h Schedule Optimizer
        </button>
        <button
          className={`scada-btn ${activeTab === 'controls' ? 'scada-btn-primary' : 'scada-btn-secondary'}`}
          onClick={() => setActiveTab('controls')}
        >
          <Sliders size={16} /> Grid & DER Controls
        </button>
        <button
          className={`scada-btn ${activeTab === 'alarms' ? 'scada-btn-primary' : 'scada-btn-secondary'}`}
          onClick={() => setActiveTab('alarms')}
        >
          <AlertTriangle size={16} /> SCADA Alarms ({t.active_alarms_count})
        </button>
      </div>

      {/* 3. TAB 1: OVERVIEW & REAL-TIME POWER FLOW */}
      {activeTab === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          
          {/* Interactive Energy Flow Diagram */}
          <div className="scada-card" style={{ padding: '1.75rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <div>
                <h2 style={{ fontSize: '1.2rem', fontWeight: 700, letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <Zap size={20} color="#10b981" /> Real-Time Energy Flow & Power Balance SCADA
                </h2>
                <p style={{ fontSize: '0.825rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                  Active physical distribution across 480V 3-Phase Microgrid AC Bus (MG-ALPHA-01)
                </p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span className="hud-label font-mono">
                  Balance Residual: {Math.abs(t.net_power_balance_kw).toFixed(3)} kW
                </span>
                <span className={`status-pill ${Math.abs(t.net_power_balance_kw) < 1.0 ? 'online' : 'warning'}`}>
                  <span className="pulse-dot" />
                  {Math.abs(t.net_power_balance_kw) < 1.0 ? 'Balanced' : 'Compensating'}
                </span>
              </div>
            </div>

            {/* SVG Diagram Canvas */}
            <div style={{ width: '100%', overflowX: 'auto' }}>
              <svg viewBox="0 0 1000 480" style={{ width: '100%', height: 'auto', minWidth: '760px' }}>
                <defs>
                  <linearGradient id="busGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#10b981" stopOpacity="0.8" />
                    <stop offset="50%" stopColor="#06b6d4" stopOpacity="0.9" />
                    <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.8" />
                  </linearGradient>
                  
                  <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur stdDeviation="4" result="blur" />
                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                  </filter>
                </defs>

                {/* CENTRAL AC BUS BAR */}
                <rect x="440" y="50" width="120" height="380" rx="16" fill="rgba(17, 24, 39, 0.95)" stroke="url(#busGrad)" strokeWidth="3" filter="url(#glow)" />
                <text x="500" y="80" textAnchor="middle" fill="#f9fafb" fontSize="13" fontWeight="700" fontFamily="Plus Jakarta Sans">MICROGRID BUS</text>
                <text x="500" y="100" textAnchor="middle" fill="#34d399" fontSize="11" fontWeight="600" fontFamily="JetBrains Mono">480V • 60.0 Hz</text>
                
                {/* Central Bus Active Sum Meters */}
                <line x1="455" y1="120" x2="545" y2="120" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
                <text x="500" y="170" textAnchor="middle" fill="#9ca3af" fontSize="10" fontWeight="600">TOTAL GENERATION</text>
                <text x="500" y="195" textAnchor="middle" fill="#34d399" fontSize="15" fontWeight="700" fontFamily="JetBrains Mono">
                  {(t.solar_kw + t.wind_kw + t.generator_power_kw + Math.max(0, t.battery_power_kw) + Math.max(0, t.grid_power_kw)).toFixed(1)} kW
                </text>

                <text x="500" y="270" textAnchor="middle" fill="#9ca3af" fontSize="10" fontWeight="600">DEMAND LOAD</text>
                <text x="500" y="295" textAnchor="middle" fill="#f43f5e" fontSize="15" fontWeight="700" fontFamily="JetBrains Mono">
                  {t.load_kw.toFixed(1)} kW
                </text>

                <line x1="455" y1="330" x2="545" y2="330" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
                <text x="500" y="365" textAnchor="middle" fill="#9ca3af" fontSize="9" fontWeight="600">DISPATCH MODE</text>
                <text x="500" y="385" textAnchor="middle" fill="#38bdf8" fontSize="10" fontWeight="700" fontFamily="JetBrains Mono">
                  {t.operational_mode}
                </text>

                {/* 1. SOLAR PV SYSTEM (Top Left) */}
                <g transform="translate(60, 40)">
                  <rect width="260" height="90" rx="12" fill="rgba(30, 41, 59, 0.7)" stroke={t.solar_kw > 1 ? "#f59e0b" : "rgba(255,255,255,0.1)"} strokeWidth="2" />
                  <circle cx="45" cy="45" r="24" fill="rgba(245, 158, 11, 0.15)" stroke="#f59e0b" strokeWidth="1.5" />
                  <text x="45" y="51" textAnchor="middle" fill="#f59e0b" fontSize="18">☀️</text>
                  <text x="85" y="36" fill="#f9fafb" fontSize="13" fontWeight="700">Solar PV Array</text>
                  <text x="85" y="56" fill="#f59e0b" fontSize="16" fontWeight="700" fontFamily="JetBrains Mono">{t.solar_kw.toFixed(1)} kW</text>
                  <text x="85" y="74" fill="#9ca3af" fontSize="10">Cap: {config?.solar_capacity_kw || 350} kW • MPPT Active</text>
                  <path d="M 260 45 L 440 100" fill="none" stroke="#f59e0b" strokeWidth="3" className={t.solar_kw > 1 ? "flow-line-animated" : ""} strokeOpacity={t.solar_kw > 1 ? "0.85" : "0.2"} />
                </g>

                {/* 2. WIND TURBINE (Middle Left) */}
                <g transform="translate(60, 180)">
                  <rect width="260" height="90" rx="12" fill="rgba(30, 41, 59, 0.7)" stroke={t.wind_kw > 1 ? "#06b6d4" : "rgba(255,255,255,0.1)"} strokeWidth="2" />
                  <circle cx="45" cy="45" r="24" fill="rgba(6, 182, 212, 0.15)" stroke="#06b6d4" strokeWidth="1.5" />
                  <text x="45" y="51" textAnchor="middle" fill="#06b6d4" fontSize="18">💨</text>
                  <text x="85" y="36" fill="#f9fafb" fontSize="13" fontWeight="700">Wind Turbine Substation</text>
                  <text x="85" y="56" fill="#06b6d4" fontSize="16" fontWeight="700" fontFamily="JetBrains Mono">{t.wind_kw.toFixed(1)} kW</text>
                  <text x="85" y="74" fill="#9ca3af" fontSize="10">Cap: {config?.wind_capacity_kw || 150} kW • Synced</text>
                  <path d="M 260 45 L 440 220" fill="none" stroke="#06b6d4" strokeWidth="3" className={t.wind_kw > 1 ? "flow-line-animated" : ""} strokeOpacity={t.wind_kw > 1 ? "0.85" : "0.2"} />
                </g>

                {/* 3. BACKUP GENERATOR (Bottom Left) */}
                <g transform="translate(60, 320)">
                  <rect width="260" height="90" rx="12" fill="rgba(30, 41, 59, 0.7)" stroke={t.generator_power_kw > 1 ? "#f43f5e" : "rgba(255,255,255,0.1)"} strokeWidth="2" />
                  <circle cx="45" cy="45" r="24" fill="rgba(244, 63, 94, 0.15)" stroke="#f43f5e" strokeWidth="1.5" />
                  <text x="45" y="51" textAnchor="middle" fill="#f43f5e" fontSize="18">⚡</text>
                  <text x="85" y="36" fill="#f9fafb" fontSize="13" fontWeight="700">Backup Generator</text>
                  <text x="85" y="56" fill="#f43f5e" fontSize="16" fontWeight="700" fontFamily="JetBrains Mono">{t.generator_power_kw.toFixed(1)} kW</text>
                  <text x="85" y="74" fill="#9ca3af" fontSize="10">
                    {t.generator_power_kw > 0 ? 'Fuel Rate: 28 L/h • On-load' : `Cap: ${config?.generator_capacity_kw || 250} kW • Standby`}
                  </text>
                  <path d="M 260 45 L 440 340" fill="none" stroke="#f43f5e" strokeWidth="3" className={t.generator_power_kw > 1 ? "flow-line-animated" : ""} strokeOpacity={t.generator_power_kw > 1 ? "0.85" : "0.2"} />
                </g>

                {/* 4. MACROGRID INTERCONNECT (Top Right) */}
                <g transform="translate(680, 40)">
                  <rect width="260" height="90" rx="12" fill="rgba(30, 41, 59, 0.7)" stroke={t.grid_connected ? "#3b82f6" : "#f59e0b"} strokeWidth="2" />
                  <circle cx="45" cy="45" r="24" fill="rgba(59, 130, 246, 0.15)" stroke="#3b82f6" strokeWidth="1.5" />
                  <text x="45" y="51" textAnchor="middle" fill="#3b82f6" fontSize="18">🏢</text>
                  <text x="85" y="36" fill="#f9fafb" fontSize="13" fontWeight="700">Macrogrid (PCC)</text>
                  <text x="85" y="56" fill="#3b82f6" fontSize="16" fontWeight="700" fontFamily="JetBrains Mono">
                    {t.grid_connected ? `${Math.abs(t.grid_power_kw).toFixed(1)} kW ${t.grid_power_kw >= 0 ? 'Imp' : 'Exp'}` : 'ISLANDED'}
                  </text>
                  <text x="85" y="74" fill="#9ca3af" fontSize="10">
                    {t.grid_connected ? `Tariff: $${t.grid_tariff_usd_per_kwh.toFixed(3)}/kWh` : 'Breaker: OPEN (Isolated)'}
                  </text>
                  <path
                    d="M 560 100 L 680 45"
                    fill="none"
                    stroke="#3b82f6"
                    strokeWidth="3"
                    className={t.grid_connected && Math.abs(t.grid_power_kw) > 1 ? (isGridImporting ? "flow-line-reverse" : "flow-line-animated") : ""}
                    strokeOpacity={t.grid_connected ? "0.85" : "0.2"}
                  />
                </g>

                {/* 5. BESS BATTERY STORAGE (Middle Right) */}
                <g transform="translate(680, 180)">
                  <rect width="260" height="90" rx="12" fill="rgba(30, 41, 59, 0.7)" stroke="#8b5cf6" strokeWidth="2" />
                  <circle cx="45" cy="45" r="24" fill="rgba(139, 92, 246, 0.15)" stroke="#8b5cf6" strokeWidth="1.5" />
                  <text x="45" y="51" textAnchor="middle" fill="#8b5cf6" fontSize="18">🔋</text>
                  <text x="85" y="36" fill="#f9fafb" fontSize="13" fontWeight="700">Li-Ion BESS System</text>
                  <text x="85" y="56" fill="#8b5cf6" fontSize="16" fontWeight="700" fontFamily="JetBrains Mono">
                    {(t.battery_soc * 100).toFixed(1)}% SoC
                  </text>
                  <text x="85" y="74" fill="#9ca3af" fontSize="10">
                    {isBatteryDischarging ? `Discharge: +${t.battery_power_kw.toFixed(1)} kW` : 
                     isBatteryCharging ? `Charge: ${t.battery_power_kw.toFixed(1)} kW` : `Idle • ${config?.battery_capacity_kwh || 600} kWh Total`}
                  </text>
                  <path
                    d="M 560 220 L 680 225"
                    fill="none"
                    stroke="#8b5cf6"
                    strokeWidth="3"
                    className={Math.abs(t.battery_power_kw) > 1 ? (isBatteryDischarging ? "flow-line-reverse" : "flow-line-animated") : ""}
                    strokeOpacity={Math.abs(t.battery_power_kw) > 1 ? "0.85" : "0.3"}
                  />
                </g>

                {/* 6. FACILITY CONSUMPTION LOAD (Bottom Right) */}
                <g transform="translate(680, 320)">
                  <rect width="260" height="90" rx="12" fill="rgba(30, 41, 59, 0.7)" stroke="#10b981" strokeWidth="2" />
                  <circle cx="45" cy="45" r="24" fill="rgba(16, 185, 129, 0.15)" stroke="#10b981" strokeWidth="1.5" />
                  <text x="45" y="51" textAnchor="middle" fill="#10b981" fontSize="18">🏭</text>
                  <text x="85" y="36" fill="#f9fafb" fontSize="13" fontWeight="700">Industrial Park Load</text>
                  <text x="85" y="56" fill="#10b981" fontSize="16" fontWeight="700" fontFamily="JetBrains Mono">{t.load_kw.toFixed(1)} kW</text>
                  <text x="85" y="74" fill="#9ca3af" fontSize="10">Critical & Flexible Feeders</text>
                  <path d="M 560 340 L 680 365" fill="none" stroke="#10b981" strokeWidth="3" className="flow-line-animated" strokeOpacity="0.85" />
                </g>

              </svg>
            </div>
          </div>

          {/* Rolling Historical Telemetry Chart */}
          <div className="scada-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <BarChart3 size={18} color="#06b6d4" /> Rolling 24-Hour Telemetry Multi-Stream
                </h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Load Demand vs Renewable Generation, BESS Dispatch, and Grid Exchange
                </p>
              </div>
              <div style={{ display: 'flex', gap: '1rem', fontSize: '0.75rem', fontWeight: 600 }}>
                <span style={{ color: '#10b981' }}>● Load (kW)</span>
                <span style={{ color: '#f59e0b' }}>● Solar (kW)</span>
                <span style={{ color: '#06b6d4' }}>● Wind (kW)</span>
                <span style={{ color: '#8b5cf6' }}>● Battery (kW)</span>
                <span style={{ color: '#3b82f6' }}>● Grid (kW)</span>
              </div>
            </div>

            {/* Custom Interactive SVG Time-Series Chart */}
            <div style={{ width: '100%', height: '240px' }}>
              <svg viewBox="0 0 900 240" style={{ width: '100%', height: '100%' }}>
                {[40, 90, 140, 190].map((y, idx) => (
                  <g key={idx}>
                    <line x1="40" y1={y} x2="880" y2={y} stroke="rgba(255,255,255,0.05)" strokeDasharray="3 3" />
                    <text x="30" y={y + 4} fill="#6b7280" fontSize="9" textAnchor="end" fontFamily="JetBrains Mono">
                      {Math.round((200 - y) * 2.5)} kW
                    </text>
                  </g>
                ))}

                {historical.length > 1 && (
                  <>
                    <polyline
                      fill="none"
                      stroke="#10b981"
                      strokeWidth="2.5"
                      points={historical.map((pt, i) => {
                        const x = 50 + (i / (historical.length - 1)) * 820;
                        const y = Math.max(20, Math.min(210, 200 - (pt.load_kw / 450) * 160));
                        return `${x},${y}`;
                      }).join(' ')}
                    />

                    <polyline
                      fill="none"
                      stroke="#f59e0b"
                      strokeWidth="2"
                      points={historical.map((pt, i) => {
                        const x = 50 + (i / (historical.length - 1)) * 820;
                        const y = Math.max(20, Math.min(210, 200 - (pt.solar_kw / 450) * 160));
                        return `${x},${y}`;
                      }).join(' ')}
                    />

                    <polyline
                      fill="none"
                      stroke="#06b6d4"
                      strokeWidth="1.8"
                      points={historical.map((pt, i) => {
                        const x = 50 + (i / (historical.length - 1)) * 820;
                        const y = Math.max(20, Math.min(210, 200 - (pt.wind_kw / 450) * 160));
                        return `${x},${y}`;
                      }).join(' ')}
                    />

                    <polyline
                      fill="none"
                      stroke="#8b5cf6"
                      strokeWidth="1.8"
                      strokeDasharray="4 2"
                      points={historical.map((pt, i) => {
                        const x = 50 + (i / (historical.length - 1)) * 820;
                        const y = Math.max(20, Math.min(210, 140 - (pt.battery_power_kw / 300) * 100));
                        return `${x},${y}`;
                      }).join(' ')}
                    />

                    <polyline
                      fill="none"
                      stroke="#3b82f6"
                      strokeWidth="1.8"
                      points={historical.map((pt, i) => {
                        const x = 50 + (i / (historical.length - 1)) * 820;
                        const y = Math.max(20, Math.min(210, 140 - (pt.grid_power_kw / 450) * 100));
                        return `${x},${y}`;
                      }).join(' ')}
                    />
                  </>
                )}

                <line x1="40" y1="205" x2="880" y2="205" stroke="rgba(255,255,255,0.15)" />
                {historical.filter((_, i) => i % Math.ceil(historical.length / 6) === 0).map((pt, idx, arr) => {
                  const x = 50 + (idx / (arr.length - 1 || 1)) * 820;
                  const time = new Date(pt.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                  return (
                    <text key={idx} x={x} y="225" fill="#9ca3af" fontSize="10" textAnchor="middle" fontFamily="JetBrains Mono">
                      {time}
                    </text>
                  );
                })}
              </svg>
            </div>
          </div>

        </div>
      )}

      {/* 4. TAB 2: 24-HOUR SCHEDULE OPTIMIZER */}
      {activeTab === 'scheduler' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          
          <div className="scada-card" style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
            <div>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Clock size={20} color="#3b82f6" /> 24-Hour Horizon Dispatch Optimizer
              </h2>
              <p style={{ fontSize: '0.825rem', color: 'var(--text-secondary)' }}>
                Solve optimal BESS charging and grid arbitrage schedule to minimize operational electricity cost
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{ display: 'flex', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', padding: '0.2rem' }}>
                <button
                  style={{
                    padding: '0.4rem 0.8rem',
                    borderRadius: '6px',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    background: selectedAlgo === 'mpc_optimal' ? '#3b82f6' : 'transparent',
                    color: selectedAlgo === 'mpc_optimal' ? '#ffffff' : 'var(--text-secondary)',
                    border: 'none',
                    cursor: 'pointer'
                  }}
                  onClick={() => { setSelectedAlgo('mpc_optimal'); handleRunOptimization('mpc_optimal'); }}
                >
                  MPC Cost-Optimal
                </button>
                <button
                  style={{
                    padding: '0.4rem 0.8rem',
                    borderRadius: '6px',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    background: selectedAlgo === 'heuristic' ? '#10b981' : 'transparent',
                    color: selectedAlgo === 'heuristic' ? '#ffffff' : 'var(--text-secondary)',
                    border: 'none',
                    cursor: 'pointer'
                  }}
                  onClick={() => { setSelectedAlgo('heuristic'); handleRunOptimization('heuristic'); }}
                >
                  Solar Heuristic
                </button>
                <button
                  style={{
                    padding: '0.4rem 0.8rem',
                    borderRadius: '6px',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    background: selectedAlgo === 'rl_policy' ? '#8b5cf6' : 'transparent',
                    color: selectedAlgo === 'rl_policy' ? '#ffffff' : 'var(--text-secondary)',
                    border: 'none',
                    cursor: 'pointer'
                  }}
                  onClick={() => { setSelectedAlgo('rl_policy'); handleRunOptimization('rl_policy'); }}
                >
                  RL Policy
                </button>
              </div>

              <button
                className="scada-btn scada-btn-primary"
                onClick={() => handleRunOptimization()}
                disabled={isOptimizing}
              >
                {isOptimizing ? <RotateCcw size={16} className="animate-spin" /> : <Play size={16} />}
                Run Solver
              </button>
            </div>
          </div>

          {/* Schedule Financial KPI Summary */}
          {schedulePlan && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
              <div className="scada-card">
                <span className="hud-label">Projected 24h Cost</span>
                <div className="hud-value" style={{ color: '#10b981' }}>
                  ${schedulePlan.total_expected_cost_usd.toFixed(2)}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                  Baseline: ${schedulePlan.baseline_cost_usd.toFixed(2)}
                </div>
              </div>

              <div className="scada-card">
                <span className="hud-label">Expected Net Savings</span>
                <div className="hud-value" style={{ color: '#38bdf8' }}>
                  ${schedulePlan.savings_usd.toFixed(2)}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#34d399', fontWeight: 600, marginTop: '0.25rem' }}>
                  ↓ {schedulePlan.savings_percentage.toFixed(1)}% reduction vs unmanaged
                </div>
              </div>

              <div className="scada-card">
                <span className="hud-label">Carbon Footprint</span>
                <div className="hud-value" style={{ color: '#f59e0b' }}>
                  {schedulePlan.total_co2_kg.toFixed(1)} <span className="hud-unit">kg CO2</span>
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                  Avg Renewable Share: {schedulePlan.renewable_penetration_avg}%
                </div>
              </div>

              <div className="scada-card">
                <span className="hud-label">Algorithm Engine</span>
                <div className="hud-value" style={{ fontSize: '1.25rem', color: 'var(--text-primary)' }}>
                  {schedulePlan.algorithm.toUpperCase()}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                  ID: {schedulePlan.schedule_id}
                </div>
              </div>
            </div>
          )}

          {/* Forecast & Schedule Side-by-Side View */}
          {forecast.length > 0 && (
            <div className="scada-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <span className="hud-label" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Server size={14} color="#3b82f6" /> 24-Hour Forward Resource Forecast Summary
                </span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Forecast Horizon: 24h Ahead
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.5rem', maxHeight: '120px', overflowY: 'auto' }}>
                {forecast.slice(0, 12).map((fc, i) => (
                  <div key={i} style={{ background: 'rgba(255,255,255,0.03)', padding: '0.4rem 0.6rem', borderRadius: '6px', fontSize: '0.75rem' }}>
                    <div className="font-mono" style={{ fontWeight: 700, color: '#9ca3af' }}>{fc.time_str}</div>
                    <div style={{ color: '#10b981' }}>L: {fc.load_kw.toFixed(0)} kW</div>
                    <div style={{ color: '#f59e0b' }}>PV: {fc.solar_kw.toFixed(0)} kW</div>
                    <div style={{ color: '#38bdf8' }}>${fc.tariff_usd_per_kwh.toFixed(2)}/u</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 24h Dispatch Schedule Visual Horizon */}
          {schedulePlan && (
            <div className="scada-card">
              <h3 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Activity size={18} color="#10b981" /> 24-Hour Hourly Dispatch Schedule Plan
              </h3>
              
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', textAlign: 'left' }}>
                      <th style={{ padding: '0.75rem 0.5rem' }}>Hour</th>
                      <th style={{ padding: '0.75rem 0.5rem' }}>Load (kW)</th>
                      <th style={{ padding: '0.75rem 0.5rem' }}>Solar (kW)</th>
                      <th style={{ padding: '0.75rem 0.5rem' }}>Wind (kW)</th>
                      <th style={{ padding: '0.75rem 0.5rem' }}>Battery (kW)</th>
                      <th style={{ padding: '0.75rem 0.5rem' }}>End SoC</th>
                      <th style={{ padding: '0.75rem 0.5rem' }}>Grid (kW)</th>
                      <th style={{ padding: '0.75rem 0.5rem' }}>Tariff ($/kWh)</th>
                      <th style={{ padding: '0.75rem 0.5rem' }}>Est. Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {schedulePlan.hourly_plan.map((item, idx) => (
                      <tr
                        key={idx}
                        style={{
                          borderBottom: '1px solid rgba(255,255,255,0.04)',
                          background: item.tariff_usd_per_kwh > 0.30 ? 'rgba(239, 68, 68, 0.05)' : 'transparent',
                        }}
                      >
                        <td className="font-mono" style={{ padding: '0.65rem 0.5rem', fontWeight: 600 }}>
                          {item.time_str}
                        </td>
                        <td className="font-mono" style={{ padding: '0.65rem 0.5rem', color: '#10b981' }}>
                          {item.load_forecast_kw.toFixed(1)}
                        </td>
                        <td className="font-mono" style={{ padding: '0.65rem 0.5rem', color: '#f59e0b' }}>
                          {item.solar_forecast_kw.toFixed(1)}
                        </td>
                        <td className="font-mono" style={{ padding: '0.65rem 0.5rem', color: '#06b6d4' }}>
                          {item.wind_forecast_kw.toFixed(1)}
                        </td>
                        <td className="font-mono" style={{
                          padding: '0.65rem 0.5rem',
                          color: item.battery_scheduled_kw > 0 ? '#38bdf8' : (item.battery_scheduled_kw < 0 ? '#a78bfa' : 'var(--text-muted)'),
                          fontWeight: 600
                        }}>
                          {item.battery_scheduled_kw > 0 ? `+${item.battery_scheduled_kw.toFixed(1)}` : item.battery_scheduled_kw.toFixed(1)}
                        </td>
                        <td className="font-mono" style={{ padding: '0.65rem 0.5rem' }}>
                          {(item.battery_expected_soc * 100).toFixed(1)}%
                        </td>
                        <td className="font-mono" style={{
                          padding: '0.65rem 0.5rem',
                          color: item.grid_scheduled_kw > 0 ? '#f43f5e' : '#34d399',
                          fontWeight: 600
                        }}>
                          {item.grid_scheduled_kw.toFixed(1)}
                        </td>
                        <td className="font-mono" style={{ padding: '0.65rem 0.5rem' }}>
                          ${item.tariff_usd_per_kwh.toFixed(3)}
                        </td>
                        <td className="font-mono" style={{ padding: '0.65rem 0.5rem', fontWeight: 600 }}>
                          ${item.hourly_cost_usd.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </div>
      )}

      {/* 5. TAB 3: GRID PCC & MANUAL OVERRIDES */}
      {activeTab === 'controls' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '1.5rem' }}>
          
          {/* Islanding & Breaker Controls */}
          <div className="scada-card" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div>
              <h2 style={{ fontSize: '1.15rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Power size={20} color="#3b82f6" /> PCC Interconnect & Islanding
              </h2>
              <p style={{ fontSize: '0.825rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                Control the Point of Common Coupling (PCC) main circuit breaker to isolate the microgrid.
              </p>
            </div>

            <div style={{
              padding: '1.25rem',
              borderRadius: '10px',
              background: isIslanded ? 'rgba(245, 158, 11, 0.1)' : 'rgba(59, 130, 246, 0.1)',
              border: `1px solid ${isIslanded ? 'rgba(245, 158, 11, 0.3)' : 'rgba(59, 130, 246, 0.3)'}`,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: '1rem', color: isIslanded ? '#fbbf24' : '#60a5fa' }}>
                  {isIslanded ? 'ISLANDED MODE (STANDALONE)' : 'GRID-TIED OPERATION'}
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                  {isIslanded ? 'Microgrid isolated; DERs form voltage and frequency reference.' : 'Synchronized with utility macrogrid feeder.'}
                </div>
              </div>

              <button
                className={`scada-btn ${isIslanded ? 'scada-btn-primary' : 'scada-btn-danger'}`}
                onClick={() => {
                  const newIsland = !isIslanded;
                  setIsIslanded(newIsland);
                  handleApplyOverrides(newIsland, manualBattKw, manualGenKw);
                }}
              >
                {isIslanded ? 'Reconnect Grid' : 'Trip Islanding Breaker'}
              </button>
            </div>

            <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '1rem' }}>
              <h3 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.5rem' }}>Asset Parameters</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', fontSize: '0.8rem' }}>
                <div style={{ color: 'var(--text-secondary)' }}>Solar Capacity: <span className="font-mono" style={{ color: '#fff' }}>{config?.solar_capacity_kw || 350} kW</span></div>
                <div style={{ color: 'var(--text-secondary)' }}>Wind Capacity: <span className="font-mono" style={{ color: '#fff' }}>{config?.wind_capacity_kw || 150} kW</span></div>
                <div style={{ color: 'var(--text-secondary)' }}>Battery Cap: <span className="font-mono" style={{ color: '#fff' }}>{config?.battery_capacity_kwh || 600} kWh</span></div>
                <div style={{ color: 'var(--text-secondary)' }}>Generator Cap: <span className="font-mono" style={{ color: '#fff' }}>{config?.generator_capacity_kw || 250} kW</span></div>
                <div style={{ color: 'var(--text-secondary)' }}>Grid Limit: <span className="font-mono" style={{ color: '#fff' }}>{config?.grid_import_limit_kw || 450} kW</span></div>
                <div style={{ color: 'var(--text-secondary)' }}>Round-Trip Eff: <span className="font-mono" style={{ color: '#fff' }}>{((config?.battery_roundtrip_efficiency || 0.92) * 100).toFixed(1)}%</span></div>
              </div>
            </div>
          </div>

          {/* DER Manual Dispatch Setpoints */}
          <div className="scada-card" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2 style={{ fontSize: '1.15rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Sliders size={20} color="#10b981" /> DER Manual Dispatch Overrides
                </h2>
                <p style={{ fontSize: '0.825rem', color: 'var(--text-secondary)' }}>
                  Override autonomous scheduler with direct manual kW setpoints
                </p>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.85rem' }}>
                <input
                  type="checkbox"
                  checked={manualMode}
                  onChange={(e) => {
                    setManualMode(e.target.checked);
                    if (!e.target.checked) {
                      handleApplyOverrides(isIslanded, 0, 0);
                    }
                  }}
                />
                Enable Manual
              </label>
            </div>

            {/* Battery Slider */}
            <div style={{ opacity: manualMode ? 1 : 0.45, pointerEvents: manualMode ? 'auto' : 'none' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '0.4rem' }}>
                <span>Battery Dispatch (kW):</span>
                <span className="font-mono" style={{ fontWeight: 700, color: manualBattKw > 0 ? '#38bdf8' : (manualBattKw < 0 ? '#a78bfa' : '#fff') }}>
                  {manualBattKw > 0 ? `+${manualBattKw} (Discharge)` : manualBattKw < 0 ? `${manualBattKw} (Charge)` : '0 kW (Idle)'}
                </span>
              </div>
              <input
                type="range"
                min="-250"
                max="250"
                step="10"
                value={manualBattKw}
                onChange={(e) => setManualBattKw(parseFloat(e.target.value))}
                style={{ width: '100%' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                <span>-250 kW (Max Charge)</span>
                <span>0 kW</span>
                <span>+250 kW (Max Discharge)</span>
              </div>
            </div>

            {/* Generator Slider */}
            <div style={{ opacity: manualMode ? 1 : 0.45, pointerEvents: manualMode ? 'auto' : 'none' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '0.4rem' }}>
                <span>Generator Setpoint (kW):</span>
                <span className="font-mono" style={{ fontWeight: 700, color: manualGenKw > 0 ? '#f43f5e' : '#fff' }}>
                  {manualGenKw} kW
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="250"
                step="10"
                value={manualGenKw}
                onChange={(e) => setManualGenKw(parseFloat(e.target.value))}
                style={{ width: '100%' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                <span>0 kW (Off)</span>
                <span>125 kW (50%)</span>
                <span>250 kW (Rated)</span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', marginTop: 'auto' }}>
              <button
                className="scada-btn scada-btn-primary"
                style={{ flex: 1 }}
                disabled={!manualMode}
                onClick={() => handleApplyOverrides(isIslanded, manualBattKw, manualGenKw)}
              >
                Apply Overrides
              </button>
              <button
                className="scada-btn scada-btn-secondary"
                onClick={() => {
                  setManualMode(false);
                  setManualBattKw(0);
                  setManualGenKw(0);
                  handleApplyOverrides(isIslanded, 0, 0);
                }}
              >
                Restore AI Autonomous
              </button>
            </div>

            {controlFeedback && (
              <div style={{ fontSize: '0.8rem', color: '#34d399', fontWeight: 600, textAlign: 'center' }}>
                {controlFeedback}
              </div>
            )}
          </div>

        </div>
      )}

      {/* 6. TAB 4: SCADA ALARMS & INCIDENTS */}
      {activeTab === 'alarms' && (
        <div className="scada-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
            <div>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <AlertTriangle size={20} color="#f59e0b" /> SCADA Telemetry Alarms & Event Stream
              </h2>
              <p style={{ fontSize: '0.825rem', color: 'var(--text-secondary)' }}>
                Active system threshold warnings, breaker status trips, and power quality notifications
              </p>
            </div>
            <span className="status-pill online">
              Live Monitor Active
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {alerts.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                No active alarms detected. Microgrid operating nominally.
              </div>
            ) : (
              alerts.map((alert) => (
                <div
                  key={alert.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '1rem',
                    borderRadius: '8px',
                    background: alert.resolved ? 'rgba(255, 255, 255, 0.02)' : 'rgba(255, 255, 255, 0.05)',
                    borderLeft: `4px solid ${
                      alert.severity === 'CRITICAL' ? '#ef4444' : (alert.severity === 'WARNING' ? '#f59e0b' : '#3b82f6')
                    }`,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div className={`status-pill ${alert.severity === 'CRITICAL' ? 'warning' : 'islanded'}`} style={{ fontSize: '0.7rem' }}>
                      {alert.severity}
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#f9fafb' }}>
                        [{alert.source}] {alert.message}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                        {new Date(alert.timestamp).toLocaleString()} • Telemetry Metric: {alert.metric_value ?? 'N/A'}
                      </div>
                    </div>
                  </div>

                  <div>
                    {alert.resolved ? (
                      <span style={{ fontSize: '0.8rem', color: '#10b981', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                        <CheckCircle2 size={16} /> Resolved
                      </span>
                    ) : (
                      <button
                        className="scada-btn scada-btn-secondary"
                        style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem' }}
                        onClick={() => handleResolveAlert(alert.id)}
                      >
                        Acknowledge
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

    </div>
  );
};
