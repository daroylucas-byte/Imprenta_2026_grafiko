import { lazy, Suspense, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const KanbanPage = lazy(() => import('./pages/KanbanPage'));
const ClientsPage = lazy(() => import('./pages/ClientsPage'));
const SuppliersPage = lazy(() => import('./pages/SuppliersPage'));
const InsumosPage = lazy(() => import('./pages/InsumosPage'));
const PurchasesPage = lazy(() => import('./pages/PurchasesPage'));
const BillingPage = lazy(() => import('./pages/BillingPage'));
const ConfigDropdownPage = lazy(() => import('./pages/ConfigDropdownPage'));
const ProductsPage = lazy(() => import('./pages/ProductsPage'));
const CashRegisterPage = lazy(() => import('./pages/CashRegisterPage'));
const PromotionsPage = lazy(() => import('./pages/PromotionsPage'));
const ClientCampaignsPage = lazy(() => import('./pages/ClientCampaignsPage'));
const ArcaConfigPage = lazy(() => import('./pages/ArcaConfigPage'));
const ServiciosPage = lazy(() => import('./pages/ServiciosPage'));
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
    <Suspense fallback={<div className="min-h-screen bg-surface flex items-center justify-center"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div></div>}>
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
        path="/proveedores"
        element={user ? <Layout title="Gestión de Proveedores"><SuppliersPage /></Layout> : <Navigate to="/login" />}
      />

      <Route
        path="/insumos"
        element={user ? <Layout title="Insumos y Stock"><InsumosPage /></Layout> : <Navigate to="/login" />}
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
        path="/compras"
        element={user ? <Layout title="Compras"><PurchasesPage /></Layout> : <Navigate to="/login" />}
      />

      <Route
        path="/configuracion"
        element={user ? <Layout title="Configuración Sistema"><ConfigDropdownPage /></Layout> : <Navigate to="/login" />}
      />

      <Route
        path="/configuracion/arca"
        element={user ? <Layout title="Configuración ARCA/AFIP"><ArcaConfigPage /></Layout> : <Navigate to="/login" />}
      />

      <Route
        path="/configuracion/servicios"
        element={user ? <Layout title="Servicios y Costeo"><ServiciosPage /></Layout> : <Navigate to="/login" />}
      />

      <Route
        path="/caja"
        element={user ? <Layout title="Caja Registradora"><CashRegisterPage /></Layout> : <Navigate to="/login" />}
      />

      <Route
        path="/promociones"
        element={user ? <Layout title="Promociones IA"><PromotionsPage /></Layout> : <Navigate to="/login" />}
      />

      <Route
        path="/campanas"
        element={user ? <Layout title="Campañas de Clientes"><ClientCampaignsPage /></Layout> : <Navigate to="/login" />}
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
                <p className="text-sm">Próximamente para Grafiko.</p>
              </div>
            </Layout>
          ) : (
            <Navigate to="/login" />
          )
        }
      />
    </Routes>
    </Suspense>
  );
}

export default App;
