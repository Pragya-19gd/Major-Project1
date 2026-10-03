import React from 'react';
import { Activity, Play, Pause, RefreshCw, Cpu, Zap, Database, ShieldAlert, TrendingUp } from 'lucide-react';

interface HeaderProps {
  isConnected: boolean;
  isPaused: boolean;
  algorithm: string;
  scenario: string;
  step: number;
  cumulativeCost: number;
  baselineCost?: number;
  savingsPercent?: number;
  onTogglePause: () => void;
  onResetHistory: () => void;
  onAlgorithmChange: (algo: string) => void;
  onScenarioChange: (scenario: string) => void;
}

export const Header: React.FC<HeaderProps> = ({
  isConnected,
  isPaused,
  algorithm,
  scenario,
  step,
  cumulativeCost,
  baselineCost = 0,
  savingsPercent = 0,
  onTogglePause,
  onResetHistory,
  onAlgorithmChange,
  onScenarioChange,
}) => {
  return (
    <header className="glass-card" style={{ padding: '1.25rem 1.75rem', marginBottom: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        
        {/* Left Title & Status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{
            background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
            padding: '0.75rem',
            borderRadius: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 20px rgba(168, 85, 247, 0.4)'
          }}>
            <Zap size={28} color="#ffffff" />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <h1 style={{ fontSize: '1.5rem', fontWeight: 800, background: 'linear-gradient(90deg, #ffffff 0%, #cbd5e1 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                Microgrid AI Scheduler
              </h1>
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.375rem',
                padding: '0.25rem 0.625rem',
                borderRadius: '9999px',
                fontSize: '0.75rem',
                fontWeight: 600,
                background: isConnected ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                color: isConnected ? '#34d399' : '#f87171',
                border: `1px solid ${isConnected ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`
              }}>
                <span style={{
                  width: '7px',
                  height: '7px',
                  borderRadius: '50%',
                  backgroundColor: isConnected ? '#10b981' : '#ef4444'
                }} className={isConnected ? 'animate-pulse-glow' : ''} />
                {isConnected ? (isPaused ? 'Paused' : 'Live WS') : 'Disconnected'}
              </div>
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.125rem' }}>
              Real-time Deep Reinforcement Learning Energy Management System
            </p>
          </div>
        </div>

        {/* Right Info Tickers & Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          
          {/* Scenario Selector */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            background: 'rgba(30, 41, 59, 0.6)',
            padding: '0.5rem 0.875rem',
            borderRadius: '10px',
            border: scenario !== 'normal' ? '1px solid #f59e0b' : '1px solid var(--border-color)'
          }}>
            <ShieldAlert size={18} color={scenario !== 'normal' ? '#f59e0b' : '#38bdf8'} />
            <div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Scenario</div>
              <select
                value={scenario}
                onChange={(e) => onScenarioChange(e.target.value)}
                style={{
                  background: 'transparent',
                  color: scenario !== 'normal' ? '#fbbf24' : '#e2e8f0',
                  border: 'none',
                  outline: 'none',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  cursor: 'pointer'
                }}
              >
                <option value="normal" style={{ background: '#1e293b', color: '#fff' }}>Normal Dynamic</option>
                <option value="blackout" style={{ background: '#1e293b', color: '#fff' }}>⚠️ Grid Blackout</option>
                <option value="peak_surge" style={{ background: '#1e293b', color: '#fff' }}>🔥 Peak Demand Surge</option>
                <option value="cloudy" style={{ background: '#1e293b', color: '#fff' }}>☁️ Cloudy Low Solar</option>
              </select>
            </div>
          </div>

          {/* Agent Badge */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            background: 'rgba(30, 41, 59, 0.6)',
            padding: '0.5rem 0.875rem',
            borderRadius: '10px',
            border: '1px solid var(--border-color)'
          }}>
            <Cpu size={18} color="#a855f7" />
            <div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Agent Policy</div>
              <select
                value={algorithm}
                onChange={(e) => onAlgorithmChange(e.target.value)}
                style={{
                  background: 'transparent',
                  color: '#e2e8f0',
                  border: 'none',
                  outline: 'none',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  cursor: 'pointer'
                }}
              >
                <option value="DQN" style={{ background: '#1e293b', color: '#fff' }}>DQN (Deep Q-Network)</option>
                <option value="PPO" style={{ background: '#1e293b', color: '#fff' }}>PPO (Actor-Critic)</option>
                <option value="Rule-Based" style={{ background: '#1e293b', color: '#fff' }}>Heuristic Baseline</option>
              </select>
            </div>
          </div>

          {/* Simulation Step Counter */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            background: 'rgba(30, 41, 59, 0.6)',
            padding: '0.5rem 0.875rem',
            borderRadius: '10px',
            border: '1px solid var(--border-color)'
          }}>
            <Activity size={18} color="#06b6d4" />
            <div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Step</div>
              <div className="font-mono" style={{ fontSize: '0.875rem', fontWeight: 700, color: '#38bdf8' }}>
                #{step}
              </div>
            </div>
          </div>

          {/* Net Cost Counter */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            background: 'rgba(30, 41, 59, 0.6)',
            padding: '0.5rem 0.875rem',
            borderRadius: '10px',
            border: '1px solid var(--border-color)'
          }}>
            <Database size={18} color={cumulativeCost <= 0 ? '#10b981' : '#f43f5e'} />
            <div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Net Cost</div>
              <div className="font-mono" style={{ fontSize: '0.875rem', fontWeight: 700, color: cumulativeCost <= 0 ? '#34d399' : '#f87171' }}>
                ${cumulativeCost.toFixed(2)}
              </div>
            </div>
          </div>

          {/* Savings Ticker vs Baseline */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            background: 'rgba(16, 185, 129, 0.12)',
            padding: '0.5rem 0.875rem',
            borderRadius: '10px',
            border: '1px solid rgba(16, 185, 129, 0.3)'
          }}>
            <TrendingUp size={18} color="#10b981" />
            <div>
              <div style={{ fontSize: '0.7rem', color: '#6ee7b7', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Savings vs Baseline</div>
              <div className="font-mono" style={{ fontSize: '0.875rem', fontWeight: 700, color: '#34d399' }}>
                +{savingsPercent.toFixed(1)}% (${(baselineCost - cumulativeCost).toFixed(2)})
              </div>
            </div>
          </div>

          {/* Controls Buttons */}
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={onTogglePause}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.375rem',
                background: isPaused ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                color: isPaused ? '#34d399' : '#f87171',
                border: `1px solid ${isPaused ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)'}`,
                padding: '0.5rem 0.875rem',
                borderRadius: '10px',
                fontWeight: 600,
                fontSize: '0.85rem',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              {isPaused ? <Play size={16} /> : <Pause size={16} />}
              {isPaused ? 'Resume' : 'Pause'}
            </button>

            <button
              onClick={onResetHistory}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.375rem',
                background: 'rgba(255, 255, 255, 0.05)',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border-color)',
                padding: '0.5rem 0.875rem',
                borderRadius: '10px',
                fontWeight: 600,
                fontSize: '0.85rem',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              title="Reset telemetry chart history"
            >
              <RefreshCw size={16} />
              Reset
            </button>
          </div>

        </div>

      </div>
    </header>
  );
};


