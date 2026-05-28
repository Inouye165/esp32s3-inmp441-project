import React, { useEffect, useState } from 'react';
import type { Module } from '../types';
import './Dashboard.css';

export const Dashboard: React.FC = () => {
  const [modules, setModules] = useState<Module[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/modules')
      .then(res => res.json())
      .then(data => {
        setModules(data);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to load modules:', err);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="dashboard-loading">
        <div className="spinner"></div>
        <div>Loading modules...</div>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1>🔌 ESP Module Manager</h1>
      </header>
      
      <div className="dashboard-content">
        <div className="modules-grid">
          {modules.map(module => (
            <a 
              key={module.id} 
              href={`/module?id=${module.id}`}
              className="module-card"
            >
              <div className="module-card-image">
                {module.imageFile ? (
                  <img src={`/uploads/${module.imageFile}`} alt={module.name} />
                ) : (
                  <div className="module-card-placeholder">📷</div>
                )}
              </div>
              <div className="module-card-body">
                <h3>{module.name}</h3>
                <div className="module-card-badges">
                  <span className="badge badge-primary">{module.type}</span>
                  <span className="badge badge-info">{module.model}</span>
                </div>
                <div className="module-card-id">{module.id}</div>
              </div>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
};
