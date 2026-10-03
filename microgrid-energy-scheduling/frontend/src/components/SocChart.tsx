import React from 'react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine } from 'recharts';
import type { HistoryPoint } from '../types/telemetry';

interface SocChartProps {
  history: HistoryPoint[];
}

export const SocChart: React.FC<SocChartProps> = ({ history }) => {
  const chartData = history.map(item => ({
    ...item,
    socPercent: Math.round(item.soc * 100)
  }));

  return (
    <div className="glass-card" style={{ padding: '1.5rem', height: '380px', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <div>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#f3f4f6' }}>
            Battery State of Charge (%)
          </h3>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            Real-time BESS Energy Reserve & Safety Bounds
          </p>
        </div>
        <div style={{ fontSize: '0.75rem', color: '#a855f7', fontWeight: 600 }}>
          Safe Range: 20% - 90%
        </div>
      </div>

      <div style={{ flex: 1, width: '100%', minHeight: '260px' }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.06)" />
            <XAxis dataKey="timeLabel" stroke="#64748b" fontSize={11} />
            <YAxis stroke="#64748b" fontSize={11} domain={[0, 100]} unit="%" />
            <Tooltip
              contentStyle={{
                backgroundColor: 'rgba(15, 23, 42, 0.95)',
                borderColor: 'rgba(255, 255, 255, 0.15)',
                borderRadius: '10px',
                color: '#f8fafc',
                fontSize: '0.85rem'
              }}
            />
            <ReferenceLine y={90} stroke="#ef4444" strokeDasharray="3 3" label={{ value: 'Max SOC 90%', fill: '#ef4444', fontSize: 10 }} />
            <ReferenceLine y={20} stroke="#f59e0b" strokeDasharray="3 3" label={{ value: 'Min SOC 20%', fill: '#f59e0b', fontSize: 10 }} />
            <Line type="monotone" dataKey="socPercent" name="Battery SOC (%)" stroke="#a855f7" strokeWidth={3} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
