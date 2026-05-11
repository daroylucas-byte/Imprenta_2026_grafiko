import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { toast } from 'react-hot-toast';
import ClientModal from '../components/ClientModal';
import ClientLedgerModal from '../components/ClientLedgerModal';
import PaymentModal from '../components/PaymentModal';

interface Client {
  id: string;
  cuit: string;
  razon_social: string;
  email: string;
  telefonos: string;
  situacion_iva: string;
  es_mayorista: boolean;
  created_at: string;
  saldo?: number;
}

const ClientsPage: React.FC = () => {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLedgerOpen, setIsLedgerOpen] = useState(false);
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [activeClient, setActiveClient] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const fetchClients = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch consolidated balances directly from the view
      const { data, error } = await supabase
        .from('v_saldo_clientes')
        .select('*')
        .order('razon_social', { ascending: true });

      if (error) throw error;
      setClients(data || []);
    } catch (error: any) {
      toast.error('Error al cargar clientes: ' + error.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  const filteredClients = clients.filter(c => 
    c.razon_social.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.cuit?.includes(searchTerm) ||
    c.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Statistics
  const totalClients = clients.length;
  const newThisMonth = clients.filter(c => {
    const created = new Date(c.created_at);
    const now = new Date();
    return created.getMonth() === now.getMonth() && created.getFullYear() === now.getFullYear();
  }).length;

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in duration-700">
      {/* Metrics Section */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-surface-container-lowest p-8 rounded-[2rem] border border-outline-variant/10 shadow-sm flex flex-col justify-between group hover:border-primary/20 transition-all">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white transition-all">
              <span className="material-symbols-outlined">group</span>
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Total Clientes</p>
              <h3 className="text-3xl font-headline font-extrabold text-on-surface">{totalClients}</h3>
            </div>
          </div>
          <p className="text-[10px] font-bold text-outline uppercase tracking-wider">Cartera de clientes activa</p>
        </div>

        <div className="bg-surface-container-lowest p-8 rounded-[2rem] border border-outline-variant/10 shadow-sm flex flex-col justify-between group hover:border-emerald-500/20 transition-all">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-600 group-hover:bg-emerald-500 group-hover:text-white transition-all">
              <span className="material-symbols-outlined">person_add</span>
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Nuevos (Mes)</p>
              <h3 className="text-3xl font-headline font-extrabold text-on-surface">+{newThisMonth}</h3>
            </div>
          </div>
          <p className="text-[10px] font-bold text-outline uppercase tracking-wider">Alta de cuentas este periodo</p>
        </div>

        <div className="bg-gradient-to-br from-slate-900 to-slate-800 p-8 rounded-[2rem] shadow-xl flex items-center justify-between group cursor-pointer hover:scale-[0.98] transition-all" onClick={() => setIsModalOpen(true)}>
           <div className="text-white space-y-1">
             <h4 className="text-lg font-headline font-extrabold tracking-tight">Expandir Cartera</h4>
             <p className="text-slate-400 text-xs font-bold uppercase tracking-widest leading-none">Registrar nuevo socio</p>
           </div>
           <div className="w-14 h-14 bg-white/10 rounded-2xl flex items-center justify-center text-white backdrop-blur-md group-hover:bg-primary transition-colors">
              <span className="material-symbols-outlined text-3xl">add</span>
           </div>
        </div>
      </div>

      {/* Main Table Section */}
      <div className="bg-surface-container-lowest rounded-[2.5rem] shadow-sm border border-outline-variant/10 overflow-hidden">
        <div className="p-8 border-b border-outline-variant/5 flex flex-col md:flex-row justify-between items-center gap-6">
          <h2 className="text-2xl font-headline font-extrabold text-on-surface tracking-tight">Directorio Comercial</h2>
          <div className="relative w-full md:w-96">
            <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant">search</span>
            <input 
              className="w-full bg-surface-container-low border-none rounded-2xl pl-12 pr-6 py-3 text-sm font-bold focus:ring-2 focus:ring-primary/20 transition-all shadow-inner"
              placeholder="Buscar por Razón Social, CUIT o Email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <div className="overflow-x-auto no-scrollbar">
          {loading ? (
            <div className="h-64 flex flex-col items-center justify-center space-y-4 text-primary/30">
              <div className="w-10 h-10 border-4 border-primary/10 border-t-primary rounded-full animate-spin"></div>
              <p className="text-[10px] font-black uppercase tracking-widest">Sincronizando Directorio...</p>
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface-container-low/30">
                  <th className="px-8 py-5 text-[10px] font-black text-on-surface-variant uppercase tracking-widest">Razón Social</th>
                  <th className="px-6 py-5 text-[10px] font-black text-on-surface-variant uppercase tracking-widest">CUIT</th>
                  <th className="px-6 py-5 text-[10px] font-black text-on-surface-variant uppercase tracking-widest">IVA</th>
                  <th className="px-6 py-5 text-[10px] font-black text-on-surface-variant uppercase tracking-widest">Saldo</th>
                  <th className="px-8 py-5 text-[10px] font-black text-on-surface-variant uppercase tracking-widest text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/5">
                {filteredClients.map((client, i) => (
                  <tr key={client.id} className="hover:bg-surface-container-high transition-colors group cursor-pointer animate-in fade-in slide-in-from-right-4 duration-300" style={{ animationDelay: `${i * 30}ms` }}>
                    <td className="px-8 py-5">
                       <p className="text-sm font-headline font-extrabold text-on-surface group-hover:text-primary transition-colors">{client.razon_social}</p>
                       <p className="text-[10px] text-on-surface-variant font-bold uppercase tracking-tighter">{client.email || 'Sin email'}</p>
                    </td>
                    <td className="px-6 py-5 text-sm font-bold text-secondary">{client.cuit || '---'}</td>
                    <td className="px-6 py-5">
                       <div className="flex flex-col gap-1">
                         <span className="px-2.5 py-1 bg-surface-container-low text-on-surface-variant text-[9px] font-black uppercase rounded-lg border border-outline-variant/10 tracking-widest w-fit">
                           {client.situacion_iva}
                         </span>
                         <span className={`px-2.5 py-1 text-[9px] font-black uppercase rounded-lg tracking-widest w-fit border ${
                           client.es_mayorista 
                             ? 'bg-primary/10 text-primary border-primary/20' 
                             : 'bg-secondary/10 text-secondary border-secondary/20'
                         }`}>
                           {client.es_mayorista ? 'MAYORISTA' : 'MINORISTA'}
                         </span>
                       </div>
                    </td>
                    <td className="px-6 py-5">
                       <p className={`text-sm font-black ${Number(client.saldo_total || 0) > 0 ? 'text-error' : Number(client.saldo_total || 0) < 0 ? 'text-emerald-600' : 'text-on-surface'}`}>
                         $ {Number(client.saldo_total || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                       </p>
                       {Number((client as any).saldo_disponible_cc || 0) > 0 && (
                         <p className="text-[9px] font-bold text-indigo-600 uppercase tracking-tighter">
                           Crédito CC: $ {Number((client as any).saldo_disponible_cc).toLocaleString('es-AR')}
                         </p>
                       )}
                    </td>
                    <td className="px-8 py-5 text-center">
                       <div className="flex justify-center gap-2">
                         <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveClient(client);
                              setIsLedgerOpen(true);
                            }}
                            title="Ver Cuenta Corriente"
                            className="bg-indigo-50 text-indigo-600 hover:bg-indigo-600 hover:text-white transition-all p-2 rounded-xl border border-indigo-100 shadow-sm"
                          >
                            <span className="material-symbols-outlined text-lg">account_balance_wallet</span>
                          </button>
                          
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveClient(client);
                              setIsPaymentOpen(true);
                            }}
                            title="Registrar Cobro"
                            className="bg-emerald-50 text-emerald-600 hover:bg-emerald-600 hover:text-white transition-all p-2 rounded-xl border border-emerald-100 shadow-sm"
                          >
                            <span className="material-symbols-outlined text-lg">add_card</span>
                          </button>

                          <button 
                             onClick={(e) => {
                               e.stopPropagation();
                               setSelectedClientId(client.id);
                               setIsModalOpen(true);
                             }}
                             className="bg-slate-50 text-slate-600 hover:bg-primary hover:text-white transition-all p-2 rounded-xl border border-slate-100 shadow-sm"
                           >
                            <span className="material-symbols-outlined text-lg">edit</span>
                          </button>
                        </div>
                    </td>
                  </tr>
                ))}
                {!loading && filteredClients.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-20 text-center text-outline/40 italic text-sm">
                      No se encontraron clientes para la búsqueda "{searchTerm}"
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Ledger Modal */}
      {isLedgerOpen && activeClient && (
        <ClientLedgerModal 
          client={activeClient}
          onClose={() => {
            setIsLedgerOpen(false);
            setActiveClient(null);
          }}
        />
      )}

      {/* Payment Modal */}
      {isPaymentOpen && activeClient && (
        <PaymentModal 
          client={activeClient}
          onClose={() => {
            setIsPaymentOpen(false);
            setActiveClient(null);
          }}
          onSuccess={fetchClients}
        />
      )}

      {/* New/Edit Client Modal */}
      {isModalOpen && (
        <ClientModal 
          clientId={selectedClientId || undefined}
          onClose={() => {
            setIsModalOpen(false);
            setSelectedClientId(null);
          }} 
          onSuccess={fetchClients} 
        />
      )}
    </div>
  );
};

export default ClientsPage;
