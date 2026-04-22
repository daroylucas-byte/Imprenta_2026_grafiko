import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

interface LayoutProps {
  children: React.ReactNode;
  title?: string;
}

const Layout: React.FC<LayoutProps> = ({ children, title = "Overview Dashboard" }) => {
  const { user, signOut } = useAuthStore();
  const navigate = useNavigate();
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(false);

  const handleLogout = async () => {
    await signOut();
    navigate('/login');
  };

  const navItems = [
    { name: 'Dashboard', icon: 'dashboard', path: '/' },
    { name: 'Comercial', icon: 'storefront', path: '/comercial' },
    { name: 'Clientes', icon: 'group', path: '/clientes' },
    { name: 'Productos', icon: 'inventory_2', path: '/productos' },
    { name: 'Facturación', icon: 'receipt_long', path: '/facturacion' },
    { name: 'Compras', icon: 'shopping_cart', path: '/compras' },
    { name: 'Caja', icon: 'account_balance_wallet', path: '/caja' },
    { name: 'Configuración', icon: 'settings', path: '/configuracion' },
  ];

  return (
    <div className="min-h-screen bg-surface font-body text-on-surface">
      {/* Overlay for mobile sidebar */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60] lg:hidden animate-in fade-in duration-300"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* SideNavBar */}
      <aside className={`fixed left-0 top-0 h-full w-[240px] bg-slate-700/90 backdrop-blur-md shadow-2xl z-[70] flex flex-col py-6 transition-transform duration-300 transform ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        <div className="px-6 mb-10 flex justify-between items-center">
          <div>
            <h1 className="text-xl font-bold text-white tracking-tighter font-headline">GestiPrint</h1>
            <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400 font-medium">Architectural Atelier</p>
          </div>
          <button onClick={() => setIsSidebarOpen(false)} className="lg:hidden text-white/60 hover:text-white">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        
        <nav className="flex-1 space-y-1 overflow-y-auto no-scrollbar">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={() => setIsSidebarOpen(false)}
              className={({ isActive }) =>
                `flex items-center px-6 py-3 transition-all duration-200 group ${
                  isActive
                    ? 'border-l-2 border-primary bg-slate-800/50 text-white font-semibold'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/40'
                }`
              }
            >
              <span className={`material-symbols-outlined mr-4 transition-transform group-hover:scale-110`}>
                {item.icon}
              </span>
              <span className="font-manrope text-sm tracking-wide">{item.name}</span>
            </NavLink>
          ))}
        </nav>

        <div className="px-6 pt-6 mt-auto border-t border-slate-600/30">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-full border-2 border-primary/30 bg-primary/10 flex items-center justify-center overflow-hidden">
              <span className="material-symbols-outlined text-primary text-sm">person</span>
            </div>
            <div className="overflow-hidden">
              <p className="text-xs font-bold text-white truncate">
                {user?.user_metadata?.full_name || user?.email?.split('@')[0]}
              </p>
              <p className="text-[10px] text-slate-400 truncate">Admin Mode</p>
            </div>
          </div>
        </div>
      </aside>

      {/* TopNavBar */}
      <header className="fixed top-0 right-0 w-full lg:w-[calc(100%-240px)] h-16 bg-white/80 backdrop-blur-xl z-40 flex items-center justify-between px-4 md:px-8 border-b border-outline-variant/10 transition-all">
        <div className="flex items-center space-x-4">
          <button onClick={() => setIsSidebarOpen(true)} className="lg:hidden p-2 hover:bg-surface-container-low rounded-xl">
            <span className="material-symbols-outlined">menu</span>
          </button>
          <h2 className="font-headline font-extrabold text-on-surface text-lg md:text-xl tracking-tight truncate max-w-[150px] sm:max-w-none">{title}</h2>
        </div>
        <div className="flex items-center space-x-2 md:space-x-6">
          <div className="hidden sm:flex items-center space-x-2 text-on-surface-variant">
            <button className="p-2 hover:bg-surface-container-low rounded-full transition-colors relative">
              <span className="material-symbols-outlined">notifications</span>
              <span className="absolute top-2 right-2 w-2 h-2 bg-error rounded-full"></span>
            </button>
            <button className="p-2 hover:bg-surface-container-low rounded-full transition-colors">
              <span className="material-symbols-outlined">account_circle</span>
            </button>
          </div>
          <button
            onClick={handleLogout}
            className="bg-gradient-to-r from-primary to-primary-container text-white px-4 md:px-5 py-2 rounded-xl text-xs md:text-sm font-semibold hover:opacity-90 active:scale-95 transition-all shadow-md shadow-primary/20 whitespace-nowrap"
          >
            Logout
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="lg:ml-[240px] pt-24 px-4 md:px-8 pb-12 transition-all">
        {children}
      </main>
    </div>
  );
};

export default Layout;
