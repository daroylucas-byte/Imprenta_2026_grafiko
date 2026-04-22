import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import KanbanPage from './pages/KanbanPage';
import ClientsPage from './pages/ClientsPage';
import BillingPage from './pages/BillingPage';
import ConfigDropdownPage from './pages/ConfigDropdownPage';
import ProductsPage from './pages/ProductsPage';
import Layout from './components/Layout';

function App() {
  const { user, initialized, initialize } = useAuthStore();

  useEffect(() => {
    initialize();
  }, [initialize]);

  if (!initialized) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <Routes>
      {/* Public Routes */}
      <Route path="/login" element={!user ? <LoginPage /> : <Navigate to="/" />} />
      <Route path="/register" element={!user ? <RegisterPage /> : <Navigate to="/" />} />
      
      {/* Protected Routes Wrapper */}
      <Route
        path="/"
        element={user ? <Layout><DashboardPage /></Layout> : <Navigate to="/login" />}
      />
      
      <Route
        path="/comercial"
        element={user ? <Layout title="Trabajos Kanban"><KanbanPage /></Layout> : <Navigate to="/login" />}
      />

      <Route
        path="/clientes"
        element={user ? <Layout title="Gestión de Clientes"><ClientsPage /></Layout> : <Navigate to="/login" />}
      />

      <Route
        path="/productos"
        element={user ? <Layout title="Gestión de Productos"><ProductsPage /></Layout> : <Navigate to="/login" />}
      />

      <Route
        path="/facturacion"
        element={user ? <Layout title="Comprobantes"><BillingPage /></Layout> : <Navigate to="/login" />}
      />

      <Route
        path="/configuracion"
        element={user ? <Layout title="Configuración Sistema"><ConfigDropdownPage /></Layout> : <Navigate to="/login" />}
      />

      {/* Redirect old path */}
      <Route path="/settings" element={<Navigate to="/configuracion" replace />} />
      
      {/* Fallback for other paths within Layout */}
      <Route
        path="/*"
        element={
          user ? (
            <Layout title="Coming Soon">
              <div className="flex flex-col items-center justify-center h-[60vh] text-on-surface-variant">
                <span className="material-symbols-outlined text-6xl mb-4">construction</span>
                <p className="text-xl font-headline font-bold">Módulo en construcción</p>
                <p className="text-sm">Próximamente para GestiPrint.</p>
              </div>
            </Layout>
          ) : (
            <Navigate to="/login" />
          )
        }
      />
    </Routes>
  );
}

export default App;
