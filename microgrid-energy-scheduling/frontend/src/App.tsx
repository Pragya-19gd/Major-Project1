import React, { useState, useEffect, useRef } from 'react';
import { Header } from './components/Header';
import { KpiCards } from './components/KpiCards';
import { SystemDiagram } from './components/SystemDiagram';
import { PowerFlowChart } from './components/PowerFlowChart';
import { SocChart } from './components/SocChart';
import { CostAnalysisChart } from './components/CostAnalysisChart';
import type { TelemetryPayload, HistoryPoint } from './types/telemetry';

export const App: React.FC = () => {
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [algorithm, setAlgorithm] = useState<string>('DQN');
  const [scenario, setScenario] = useState<string>('normal');
  const [latestMetrics, setLatestMetrics] = useState<TelemetryPayload | null>(null);
  const [history, setHistory] = useState<HistoryPoint[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const isPausedRef = useRef<boolean>(isPaused);

  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  useEffect(() => {
    const wsUrl = 'ws://127.0.0.1:8000/ws/simulation';
    let reconnectTimer: ReturnType<typeof setTimeout>;

    const connectWebSocket = () => {
      console.log('Connecting to WebSocket simulation at:', wsUrl);
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('Connected to Microgrid WebSocket stream.');
        setIsConnected(true);
      };

      ws.onmessage = (event) => {
        if (isPausedRef.current) return;

        try {
          const payload: TelemetryPayload = JSON.parse(event.data);
          setLatestMetrics(payload);

          const timeStr = new Date(payload.timestamp).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
          });

          const newPoint: HistoryPoint = {
            ...payload.metrics,
            timeLabel: timeStr,
            step: payload.step,
            netPower: payload.metrics.solar_kw - payload.metrics.load_kw + payload.metrics.battery_power_kw
          };

          setHistory(prev => {
            const updated = [...prev, newPoint];
            return updated.slice(-35); // Keep last 35 data points
          });
        } catch (err) {
          console.error('Failed to parse WebSocket JSON payload:', err);
        }
      };

      ws.onerror = (err) => {
        console.error('WebSocket Error:', err);
        setIsConnected(false);
      };

      ws.onclose = () => {
        console.log('WebSocket Connection Closed. Attempting reconnect in 3s...');
        setIsConnected(false);
        reconnectTimer = setTimeout(connectWebSocket, 3000);
      };
    };

    connectWebSocket();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
    };
  }, []);

  const handleTogglePause = () => {
    setIsPaused(prev => !prev);
  };

  const handleResetHistory = () => {
    setHistory([]);
    fetch('http://127.0.0.1:8000/api/simulation/reset', { method: 'POST' }).catch(() => {});
  };

  const handleAlgorithmChange = (algo: string) => {
    setAlgorithm(algo);
    fetch('http://127.0.0.1:8000/api/simulation/algorithm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ algorithm: algo })
    }).catch(err => console.error('Failed to update algorithm:', err));
  };

  const handleScenarioChange = (scen: string) => {
    setScenario(scen);
    fetch('http://127.0.0.1:8000/api/simulation/scenario', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenario: scen })
    }).catch(err => console.error('Failed to update scenario:', err));
  };

  const metrics = latestMetrics?.metrics ?? null;
  const step = latestMetrics?.step ?? 0;
  const cumulativeCost = metrics?.cumulative_cost ?? 0;
  const baselineCost = metrics?.baseline_cumulative_cost ?? 0;
  const savingsPercent = metrics?.savings_percent ?? 0;

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '1.5rem 1.25rem 3rem 1.25rem' }}>
      
      {/* Header Bar */}
      <Header
        isConnected={isConnected}
        isPaused={isPaused}
        algorithm={algorithm}
        scenario={scenario}
        step={step}
        cumulativeCost={cumulativeCost}
        baselineCost={baselineCost}
        savingsPercent={savingsPercent}
        onTogglePause={handleTogglePause}
        onResetHistory={handleResetHistory}
        onAlgorithmChange={handleAlgorithmChange}
        onScenarioChange={handleScenarioChange}
      />

      {/* Microgrid Topology Schematic */}
      <SystemDiagram metrics={metrics} />

      {/* Main Metric Cards */}
      <KpiCards metrics={metrics} />

      {/* Charts Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(480px, 1fr))',
        gap: '1.5rem',
        marginBottom: '1.5rem'
      }}>
        <PowerFlowChart history={history} />
        <SocChart history={history} />
      </div>

      {/* Tariff & Cost Analysis */}
      <div style={{ marginBottom: '2rem' }}>
        <CostAnalysisChart history={history} />
      </div>

      {/* Footer */}
      <footer style={{
        textAlign: 'center',
        padding: '1.5rem 0',
        borderTop: '1px solid var(--border-color)',
        color: 'var(--text-muted)',
        fontSize: '0.85rem'
      }}>
        <p>Microgrid Energy Scheduling System &bull; Powered by Deep Q-Network (DQN) RL, Dynamic Scenario Testing & FastAPI</p>
      </footer>

    </div>
  );
};

export default App;

