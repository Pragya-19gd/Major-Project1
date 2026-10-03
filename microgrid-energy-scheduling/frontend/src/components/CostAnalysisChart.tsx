import React from 'react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts';
import type { HistoryPoint } from '../types/telemetry';

interface CostAnalysisChartProps {
  history: HistoryPoint[];
}

export const CostAnalysisChart: React.FC<CostAnalysisChartProps> = ({ history }) => {
  return (
    <div className="glass-card" style={{ padding: '1.5rem', height: '340px', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <div>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#f3f4f6' }}>
            Grid Electricity Tariffs & Step Cost ($/kWh)
          </h3>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            Dynamic Grid Buy/Sell Tariffs vs RL Optimization Savings
          </p>
        </div>
      </div>

      <div style={{ flex: 1, width: '100%', minHeight: '220px' }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={history} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.06)" />
            <XAxis dataKey="timeLabel" stroke="#64748b" fontSize={11} />
            <YAxis stroke="#64748b" fontSize={11} unit=" $" />
            <Tooltip
              contentStyle={{
                backgroundColor: 'rgba(15, 23, 42, 0.95)',
                borderColor: 'rgba(255, 255, 255, 0.15)',
                borderRadius: '10px',
                color: '#f8fafc',
                fontSize: '0.85rem'
              }}
            />
            <Legend wrapperStyle={{ fontSize: '0.75rem', paddingTop: '10px' }} />
            <Line type="monotone" dataKey="buy_price" name="Buy Tariff ($/kWh)" stroke="#ef4444" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="sell_price" name="Sell Feed-In ($/kWh)" stroke="#10b981" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="step_cost" name="Step Cost ($)" stroke="#ec4899" strokeWidth={2.5} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
