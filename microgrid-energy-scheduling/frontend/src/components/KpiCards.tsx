import React from 'react';
import { Sun, Home, BatteryCharging, Battery, ArrowDownRight, ArrowUpRight } from 'lucide-react';
import type { TelemetryMetrics } from '../types/telemetry';

interface KpiCardsProps {
  metrics: TelemetryMetrics | null;
}

export const KpiCards: React.FC<KpiCardsProps> = ({ metrics }) => {
  const solarKw = metrics?.solar_kw ?? 0;
  const loadKw = metrics?.load_kw ?? 0;
  const soc = metrics?.soc ?? 0;
  const batteryKw = metrics?.battery_power_kw ?? 0;
  const gridImport = metrics?.grid_import_kw ?? 0;
  const gridExport = metrics?.grid_export_kw ?? 0;
  const buyPrice = metrics?.buy_price ?? 0;
  const sellPrice = metrics?.sell_price ?? 0;
  const stepCost = metrics?.step_cost ?? 0;

  const isCharging = batteryKw < 0;
  const socPercent = Math.round(soc * 100);

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
      gap: '1.25rem',
      marginBottom: '1.5rem'
    }}>
      
      {/* Card 1: Solar Generation */}
      <div className="glass-card" style={{ padding: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Solar PV Generation
            </span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.375rem', marginTop: '0.375rem' }}>
              <span className="font-mono" style={{ fontSize: '1.85rem', fontWeight: 800, color: 'var(--color-solar)' }}>
                {solarKw.toFixed(2)}
              </span>
              <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: 600 }}>kW</span>
            </div>
          </div>
          <div style={{
            background: 'var(--color-solar-glow)',
            padding: '0.625rem',
            borderRadius: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Sun size={24} color="var(--color-solar)" className="animate-spin-slow" />
          </div>
        </div>
        <div style={{ fontSize: '0.75rem', color: '#fcd34d', marginTop: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
          <span>☀️ Active Photovoltaic Array</span>
        </div>
      </div>

      {/* Card 2: Microgrid Load */}
      <div className="glass-card" style={{ padding: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Load Demand
            </span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.375rem', marginTop: '0.375rem' }}>
              <span className="font-mono" style={{ fontSize: '1.85rem', fontWeight: 800, color: 'var(--color-load)' }}>
                {loadKw.toFixed(2)}
              </span>
              <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: 600 }}>kW</span>
            </div>
          </div>
          <div style={{
            background: 'var(--color-load-glow)',
            padding: '0.625rem',
            borderRadius: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Home size={24} color="var(--color-load)" />
          </div>
        </div>
        <div style={{ fontSize: '0.75rem', color: '#67e8f9', marginTop: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
          <span>🏢 Facility Power Consumption</span>
        </div>
      </div>

      {/* Card 3: Battery Energy Storage System (BESS) */}
      <div className="glass-card" style={{ padding: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Battery SOC / Power
            </span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginTop: '0.375rem' }}>
              <span className="font-mono" style={{ fontSize: '1.85rem', fontWeight: 800, color: 'var(--color-battery)' }}>
                {socPercent}%
              </span>
              <span className="font-mono" style={{ fontSize: '0.9rem', color: isCharging ? '#34d399' : '#f87171', fontWeight: 700 }}>
                {batteryKw !== 0 ? `${isCharging ? 'Charge' : 'Discharge'} ${Math.abs(batteryKw).toFixed(2)}kW` : 'Idle'}
              </span>
            </div>
          </div>
          <div style={{
            background: 'var(--color-battery-glow)',
            padding: '0.625rem',
            borderRadius: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            {isCharging ? <BatteryCharging size={24} color="var(--color-battery)" /> : <Battery size={24} color="var(--color-battery)" />}
          </div>
        </div>

        {/* SOC Visual Bar */}
        <div style={{ marginTop: '0.75rem' }}>
          <div style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.1)', borderRadius: '3px', overflow: 'hidden' }}>
            <div style={{
              width: `${socPercent}%`,
              height: '100%',
              background: 'linear-gradient(90deg, #6366f1 0%, #a855f7 100%)',
              borderRadius: '3px',
              transition: 'width 0.5s ease'
            }} />
          </div>
        </div>
      </div>

      {/* Card 4: Grid Net Flow & Step Cost */}
      <div className="glass-card" style={{ padding: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Grid Net Flow / Tariff
            </span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginTop: '0.375rem' }}>
              {gridExport > 0 ? (
                <span className="font-mono" style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--color-grid-export)' }}>
                  + {gridExport.toFixed(2)} kW (Export)
                </span>
              ) : (
                <span className="font-mono" style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--color-grid-import)' }}>
                  - {gridImport.toFixed(2)} kW (Import)
                </span>
              )}
            </div>
          </div>
          <div style={{
            background: gridExport > 0 ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
            padding: '0.625rem',
            borderRadius: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            {gridExport > 0 ? <ArrowUpRight size={24} color="#34d399" /> : <ArrowDownRight size={24} color="#f87171" />}
          </div>
        </div>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.75rem' }}>
          <span>Buy: <strong style={{ color: '#e2e8f0' }}>${buyPrice.toFixed(3)}</strong>/kWh</span>
          <span>Sell: <strong style={{ color: '#e2e8f0' }}>${sellPrice.toFixed(3)}</strong>/kWh</span>
          <span>Step: <strong style={{ color: stepCost <= 0 ? '#34d399' : '#f87171' }}>${stepCost.toFixed(3)}</strong></span>
        </div>
      </div>

    </div>
  );
};
