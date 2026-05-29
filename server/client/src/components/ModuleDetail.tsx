import React, { useEffect, useState } from 'react';
import type { Module } from '../types';
import { GPIOPinout } from './GPIOPinout';
import './ModuleDetail.css';

export const ModuleDetail: React.FC = () => {
  const [module, setModule] = useState<Module | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rotation, setRotation] = useState(0);

  const goBack = () => {
    const params = new URLSearchParams(window.location.search);
    const from = params.get('from');
    
    if (from === 'modules') {
      window.location.href = '/?tab=modules';
    } else if (window.history.length > 1) {
      window.history.back();
    } else {
      window.location.href = '/';
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const moduleId = params.get('id');

    if (!moduleId) {
      setError('No module ID provided');
      setLoading(false);
      return;
    }

    fetch(`/api/modules/${moduleId}`)
      .then(res => {
        if (!res.ok) throw new Error('Failed to load module');
        return res.json();
      })
      .then(data => {
        setModule(data);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="module-loading">
        <div className="spinner"></div>
        <div>Loading module details...</div>
      </div>
    );
  }

  if (error || !module) {
    return (
      <div className="module-error">
        <h5>Error Loading Module</h5>
        <p>{error || 'Module not found'}</p>
        <button onClick={goBack} className="btn-secondary">Back to Modules</button>
      </div>
    );
  }

  return (
    <div className="module-detail-page">
      {/* Compact Header */}
      <header className="module-header">
        <div className="module-header-content">
          <div className="module-header-left">
            <h1>{module.name}</h1>
            <div className="module-badges">
              <span className="badge badge-primary">{module.type}</span>
              <span className="badge badge-info">{module.model}</span>
              <span className="module-id">{module.id}</span>
            </div>
          </div>
          <div className="module-header-right">
            {module.ip && (
              <a 
                href={`http://${module.ip}:${module.port || 80}`} 
                className="btn-outline" 
                target="_blank" 
                rel="noopener noreferrer"
              >
                Open Device ↗
              </a>
            )}
            <button onClick={goBack} className="btn-outline">← Back</button>
          </div>
        </div>
      </header>

      {/* Main Content: Left (Module Info) + Right (GPIO Pinout) */}
      <div className="module-content-grid">
        {/* Left Column: Module Info */}
        <div className="module-info-column">
          {/* Module Image */}
          <div className="card">
            <h5>Module Image</h5>
            <div className={`module-image rotate-${rotation}`}>
              {module.imageFile ? (
                <img src={`/uploads/${module.imageFile}`} alt={module.name} />
              ) : (
                <div className="image-placeholder">
                  <span>📷</span>
                  <span>No image</span>
                </div>
              )}
            </div>
            <div className="rotation-controls">
              <button onClick={() => setRotation(0)} className={rotation === 0 ? 'active' : ''}>↑</button>
              <button onClick={() => setRotation(90)} className={rotation === 90 ? 'active' : ''}>→</button>
              <button onClick={() => setRotation(180)} className={rotation === 180 ? 'active' : ''}>↓</button>
              <button onClick={() => setRotation(270)} className={rotation === 270 ? 'active' : ''}>←</button>
            </div>
          </div>

          {/* Identity */}
          <div className="card">
            <h5>Identity</h5>
            <div className="info-grid">
              <div className="info-item">
                <span className="info-label">ID:</span>
                <span className="info-value">{module.id}</span>
              </div>
              <div className="info-item">
                <span className="info-label">Model:</span>
                <span className="info-value">{module.model}</span>
              </div>
              {module.macAddress && (
                <div className="info-item">
                  <span className="info-label">MAC:</span>
                  <span className="info-value">{module.macAddress}</span>
                </div>
              )}
              {module.chipId && (
                <div className="info-item">
                  <span className="info-label">Chip ID:</span>
                  <span className="info-value">{module.chipId}</span>
                </div>
              )}
            </div>
          </div>

          {/* Network */}
          {(module.ip || module.port) && (
            <div className="card">
              <h5>Network</h5>
              <div className="info-grid">
                {module.ip && (
                  <div className="info-item">
                    <span className="info-label">IP:</span>
                    <span className="info-value">{module.ip}</span>
                  </div>
                )}
                {module.port && (
                  <div className="info-item">
                    <span className="info-label">Port:</span>
                    <span className="info-value">{module.port}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Specifications */}
          <div className="card">
            <h5>Specifications</h5>
            <div className="specs-list">
              {module.type === 'ESP8266' && (
                <>
                  <div className="spec-item">
                    <strong>Chip:</strong> Tensilica L106 32-bit RISC
                  </div>
                  <div className="spec-item">
                    <strong>Clock:</strong> 80/160 MHz
                  </div>
                  <div className="spec-item">
                    <strong>RAM:</strong> ~80 KB user-data RAM
                  </div>
                  <div className="spec-item">
                    <strong>Flash:</strong> 4 MB
                  </div>
                  <div className="spec-item">
                    <strong>WiFi:</strong> 802.11 b/g/n (2.4 GHz)
                  </div>
                  <div className="spec-item">
                    <strong>GPIO:</strong> 11 usable (D0-D8, RX, TX)
                  </div>
                  <div className="spec-item">
                    <strong>Voltage:</strong> 3.3V logic (5V via USB)
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: GPIO Pinout */}
        <div className="module-pinout-column">
          <div className="card pinout-card">
            <h5>🔌 GPIO Pinout</h5>
            <GPIOPinout moduleType={module.type} />
          </div>
        </div>
      </div>
    </div>
  );
};
