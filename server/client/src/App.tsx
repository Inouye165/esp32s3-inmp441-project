import { useEffect, useState } from 'react';
import { Dashboard } from './components/Dashboard';
import { ModuleDetail } from './components/ModuleDetail';
import './App.css';

function App() {
  const [currentPage, setCurrentPage] = useState<'dashboard' | 'module'>('dashboard');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('id')) {
      setCurrentPage('module');
    } else {
      setCurrentPage('dashboard');
    }
  }, []);

  return (
    <>
      {currentPage === 'dashboard' ? <Dashboard /> : <ModuleDetail />}
    </>
  );
}

export default App;
