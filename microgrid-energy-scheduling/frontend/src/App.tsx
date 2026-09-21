import React, { useState, useEffect, useRef } from 'react';
import { Dashboard } from './components/Dashboard';
import {
  TelemetrySnapshot,
  HistoricalDataPoint,
  AlertItem,
  SystemStatusResponse,
  MicrogridConfig,
} from './types/telemetry';
import { RefreshCw, Zap, Cpu } from 'lucide-react';

export const App: React.FC = () => {
  const [telemetry, setTelemetry] = useState<TelemetrySnapshot | null>(null);
  const [historical, setHistorical] = useState<HistoricalDataPoint[]>([]);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [systemStatus, setSystemStatus] = useState<SystemStatusResponse | null>(null);
  const [config, setConfig] = useState<MicrogridConfig | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [lastHeartbeat, setLastHeartbeat] = useState<string>('');

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<any>(null);

  // Fetch initial REST data
  const loadInitialData = async () => {
    try {
      const [liveRes, histRes, alertsRes, statusRes, cfgRes] = await Promise.all([
        fetch('/api/telemetry/live'),
        fetch('/api/telemetry/history?hours=24'),
        fetch('/api/alerts'),
        fetch('/api/system/status'),
        fetch('/api/config'),
      ]);

      if (liveRes.ok) setTelemetry(await liveRes.json());
      if (histRes.ok) setHistorical(await histRes.json());
      if (alertsRes.ok) setAlerts(await alertsRes.json());
      if (statusRes.ok) setSystemStatus(await statusRes.json());
      if (cfgRes.ok) setConfig(await cfgRes.json());
    } catch (err) {
      console.warn('Initial REST data load pending server boot...', err);
    }
  };

  // WebSocket Connection Management
  useEffect(() => {
    loadInitialData();

    const connectWebSocket = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      // In Vite dev server, proxy forwards /ws to ws://127.0.0.1:8000/ws
      const wsUrl = `${protocol}//${window.location.host}/ws/telemetry`;

      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          setIsConnected(true);
          console.log('[SCADA WebSocket] Connected to Microgrid Telemetry Stream');
        };

        ws.onmessage = (event) => {
          try {
            const data: TelemetrySnapshot = JSON.parse(event.data);
            if (data && data.load_kw !== undefined) {
              setTelemetry(data);
              setLastHeartbeat(new Date().toLocaleTimeString());

              // Append to local live stream historical cache
              setHistorical((prev) => {
                const updated = [...prev, {
                  timestamp: data.timestamp,
                  load_kw: data.load_kw,
                  solar_kw: data.solar_kw,
                  wind_kw: data.wind_kw,
                  battery_soc: data.battery_soc,
                  battery_power_kw: data.battery_power_kw,
                  generator_power_kw: data.generator_power_kw,
                  grid_power_kw: data.grid_power_kw,
                  grid_tariff_usd_per_kwh: data.grid_tariff_usd_per_kwh,
                  net_cost_usd: data.net_cost_usd,
                  carbon_emissions_kg: data.carbon_emissions_kg,
                }];
                return updated.length > 500 ? updated.slice(updated.length - 500) : updated;
              });
            }
          } catch (e) {
            console.error('Error parsing telemetry stream:', e);
          }
        };

        ws.onclose = () => {
          setIsConnected(false);
          console.warn('[SCADA WebSocket] Connection lost. Attempting reconnect in 2s...');
          reconnectTimerRef.current = setTimeout(connectWebSocket, 2000);
        };

        ws.onerror = (err) => {
          console.warn('[SCADA WebSocket] Error occurred:', err);
          ws.close();
        };
      } catch (err) {
        console.error('WebSocket initialization error:', err);
        reconnectTimerRef.current = setTimeout(connectWebSocket, 3000);
      }
    };

    connectWebSocket();

    // Fallback polling interval to guarantee update freshness
    const pollingInterval = setInterval(async () => {
      try {
        const statusRes = await fetch('/api/system/status');
        if (statusRes.ok) setSystemStatus(await statusRes.json());
        const alertsRes = await fetch('/api/alerts');
        if (alertsRes.ok) setAlerts(await alertsRes.json());
      } catch {
        // ignore polling failures
      }
    }, 5000);

    return () => {
      clearInterval(pollingInterval);
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      
      {/* SCADA Global Header */}
      <header
        style={{
          background: 'rgba(11, 15, 25, 0.95)',
          backdropFilter: 'blur(16px)',
          borderBottom: '1px solid var(--border-subtle)',
          padding: '0.85rem 2rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          position: 'sticky',
          top: 0,
          zIndex: 50,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #10b981 0%, #06b6d4 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 16px rgba(16, 185, 129, 0.4)',
            }}
          >
            <Zap size={22} color="#ffffff" />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <h1 style={{ fontSize: '1.15rem', fontWeight: 800, letterSpacing: '-0.02em', color: '#f9fafb' }}>
                MICROGRID SCADA
              </h1>
              <span
                style={{
                  background: 'rgba(59, 130, 246, 0.2)',
                  color: '#60a5fa',
                  padding: '0.15rem 0.5rem',
                  borderRadius: '4px',
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  fontFamily: 'JetBrains Mono',
                }}
              >
                {telemetry?.microgrid_id || 'MG-ALPHA-01'}
              </span>
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              Industrial Energy Management & 24h Optimal Dispatch Controller
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
          {/* Connection Status Pill */}
          <div className={`status-pill ${isConnected ? 'online' : 'warning'}`}>
            <span className="pulse-dot" />
            {isConnected ? 'WebSocket Telemetry 1 Hz' : 'Reconnecting...'}
          </div>

          {/* Last heartbeat time */}
          {lastHeartbeat && (
            <span className="font-mono" style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Updated: {lastHeartbeat}
            </span>
          )}

          {/* Manual Refresh Button */}
          <button
            className="scada-btn scada-btn-secondary"
            style={{ padding: '0.45rem 0.75rem' }}
            onClick={loadInitialData}
            title="Refresh SCADA Cache"
          >
            <RefreshCw size={15} />
          </button>
        </div>
      </header>

      {/* Main Dashboard Workspace */}
      <main style={{ flex: 1, padding: '1.5rem 2rem', maxWidth: '1600px', width: '100%', margin: '0 auto' }}>
        <Dashboard
          telemetry={telemetry}
          historical={historical}
          alerts={alerts}
          systemStatus={systemStatus}
          config={config}
          isConnected={isConnected}
          onRefreshData={loadInitialData}
        />
      </main>

      {/* Industrial Footer */}
      <footer
        style={{
          borderTop: '1px solid var(--border-subtle)',
          padding: '1rem 2rem',
          fontSize: '0.75rem',
          color: 'var(--text-muted)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'rgba(11, 15, 25, 0.8)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Cpu size={14} color="#10b981" />
          <span>Microgrid SCADA v2.0 • Autonomous Optimization & Real-Time Telemetry Engine</span>
        </div>
        <div>
          <span>Sector 7 Clean Tech Park Substation • 480V 3-Phase AC Bus</span>
        </div>
      </footer>

    </div>
  );
};

export default App;
