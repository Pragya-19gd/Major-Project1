import React from 'react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import type { HistoryPoint } from '../types/telemetry';

interface PowerFlowChartProps {
  history: HistoryPoint[];
}

export const PowerFlowChart: React.FC<PowerFlowChartProps> = ({ history }) => {
  return (
    <div className="glass-card" style={{ padding: '1.5rem', height: '380px', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <div>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#f3f4f6' }}>
            Real-time Power Flow (kW)
          </h3>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            Solar PV Output vs Facility Load & Energy Dispatch
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', fontSize: '0.75rem' }}>
          <span style={{ color: '#f59e0b', fontWeight: 600 }}>● Solar</span>
          <span style={{ color: '#06b6d4', fontWeight: 600 }}>● Load</span>
          <span style={{ color: '#8b5cf6', fontWeight: 600 }}>● Battery</span>
        </div>
      </div>

      <div style={{ flex: 1, width: '100%', minHeight: '260px' }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={history} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="colorSolar" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.4}/>
                <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.0}/>
              </linearGradient>
              <linearGradient id="colorLoad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.0}/>
              </linearGradient>
              <linearGradient id="colorBattery" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.06)" />
            <XAxis dataKey="timeLabel" stroke="#64748b" fontSize={11} />
            <YAxis stroke="#64748b" fontSize={11} unit=" kW" />
            <Tooltip
              contentStyle={{
                backgroundColor: 'rgba(15, 23, 42, 0.95)',
                borderColor: 'rgba(255, 255, 255, 0.15)',
                borderRadius: '10px',
                color: '#f8fafc',
                fontSize: '0.85rem'
              }}
            />
            <Area type="monotone" dataKey="solar_kw" name="Solar (kW)" stroke="#f59e0b" strokeWidth={2.5} fillOpacity={1} fill="url(#colorSolar)" />
            <Area type="monotone" dataKey="load_kw" name="Load (kW)" stroke="#06b6d4" strokeWidth={2.5} fillOpacity={1} fill="url(#colorLoad)" />
            <Area type="monotone" dataKey="battery_power_kw" name="Battery (kW)" stroke="#8b5cf6" strokeWidth={2} fillOpacity={1} fill="url(#colorBattery)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
