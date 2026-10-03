import React from 'react';
import { Sun, Battery, Home, Zap, ArrowRight, ArrowLeft } from 'lucide-react';
import type { TelemetryMetrics } from '../types/telemetry';

interface SystemDiagramProps {
  metrics: TelemetryMetrics | null;
}

export const SystemDiagram: React.FC<SystemDiagramProps> = ({ metrics }) => {
  const solarKw = metrics?.solar_kw ?? 0;
  const loadKw = metrics?.load_kw ?? 0;
  const batteryKw = metrics?.battery_power_kw ?? 0;
  const gridExport = metrics?.grid_export_kw ?? 0;
  const gridImport = metrics?.grid_import_kw ?? 0;
  const socPercent = Math.round((metrics?.soc ?? 0) * 100);

  const isCharging = batteryKw < 0;

  return (
    <div className="glass-card" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#f3f4f6' }}>
          Interactive Microgrid Power Topology
        </h3>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
          Real-time Power Balance: <span className="font-mono" style={{ color: '#38bdf8', fontWeight: 600 }}>Solar + Battery + Grid = Load</span>
        </div>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: '1rem',
        alignItems: 'center',
        padding: '1rem 0'
      }}>

        {/* Node 1: Solar */}
        <div style={{
          background: 'rgba(245, 158, 11, 0.1)',
          border: '1px solid rgba(245, 158, 11, 0.3)',
          borderRadius: '12px',
          padding: '1rem',
          textAlign: 'center',
          position: 'relative'
        }}>
          <Sun size={32} color="#f59e0b" style={{ margin: '0 auto 0.5rem auto' }} className="animate-spin-slow" />
          <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#fcd34d' }}>Solar Generation</div>
          <div className="font-mono" style={{ fontSize: '1.25rem', fontWeight: 800, color: '#fbbf24', marginTop: '0.25rem' }}>
            {solarKw.toFixed(2)} kW
          </div>
        </div>

        {/* Connector 1 */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', color: '#94a3b8' }}>
          <ArrowRight size={24} className="animate-pulse-glow" color="#f59e0b" />
          <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>Generation</span>
        </div>

        {/* Node 2: Battery BESS */}
        <div style={{
          background: 'rgba(139, 92, 246, 0.1)',
          border: '1px solid rgba(139, 92, 246, 0.3)',
          borderRadius: '12px',
          padding: '1rem',
          textAlign: 'center'
        }}>
          <Battery size={32} color="#8b5cf6" style={{ margin: '0 auto 0.5rem auto' }} />
          <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#c084fc' }}>Battery Storage</div>
          <div className="font-mono" style={{ fontSize: '1.25rem', fontWeight: 800, color: '#a855f7', marginTop: '0.25rem' }}>
            {socPercent}% SOC
          </div>
          <div style={{ fontSize: '0.75rem', color: isCharging ? '#34d399' : '#f87171', fontWeight: 600, marginTop: '0.25rem' }}>
            {batteryKw !== 0 ? (isCharging ? `Charging (${Math.abs(batteryKw).toFixed(2)} kW)` : `Discharging (${batteryKw.toFixed(2)} kW)`) : 'Idle'}
          </div>
        </div>

        {/* Connector 2 */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', color: '#94a3b8' }}>
          <ArrowRight size={24} className="animate-pulse-glow" color="#06b6d4" />
          <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>Distribution</span>
        </div>

        {/* Node 3: Load */}
        <div style={{
          background: 'rgba(6, 182, 212, 0.1)',
          border: '1px solid rgba(6, 182, 212, 0.3)',
          borderRadius: '12px',
          padding: '1rem',
          textAlign: 'center'
        }}>
          <Home size={32} color="#06b6d4" style={{ margin: '0 auto 0.5rem auto' }} />
          <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#67e8f9' }}>Facility Demand</div>
          <div className="font-mono" style={{ fontSize: '1.25rem', fontWeight: 800, color: '#22d3ee', marginTop: '0.25rem' }}>
            {loadKw.toFixed(2)} kW
          </div>
        </div>

        {/* Connector 3 */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', color: '#94a3b8' }}>
          {gridExport > 0 ? (
            <>
              <ArrowRight size={24} color="#10b981" className="animate-pulse-glow" />
              <span style={{ fontSize: '0.7rem', color: '#34d399' }}>Grid Export</span>
            </>
          ) : (
            <>
              <ArrowLeft size={24} color="#ef4444" className="animate-pulse-glow" />
              <span style={{ fontSize: '0.7rem', color: '#f87171' }}>Grid Import</span>
            </>
          )}
        </div>

        {/* Node 4: Grid */}
        <div style={{
          background: gridExport > 0 ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
          border: `1px solid ${gridExport > 0 ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
          borderRadius: '12px',
          padding: '1rem',
          textAlign: 'center'
        }}>
          <Zap size={32} color={gridExport > 0 ? '#10b981' : '#ef4444'} style={{ margin: '0 auto 0.5rem auto' }} />
          <div style={{ fontWeight: 700, fontSize: '0.9rem', color: gridExport > 0 ? '#6ee7b7' : '#fca5a5' }}>
            Main Utility Grid
          </div>
          <div className="font-mono" style={{ fontSize: '1.25rem', fontWeight: 800, color: gridExport > 0 ? '#34d399' : '#f87171', marginTop: '0.25rem' }}>
            {gridExport > 0 ? `+${gridExport.toFixed(2)} kW` : `-${gridImport.toFixed(2)} kW`}
          </div>
        </div>

      </div>
    </div>
  );
};
