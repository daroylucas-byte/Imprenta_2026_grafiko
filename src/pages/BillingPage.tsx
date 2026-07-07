import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { toast } from 'react-hot-toast';
import BillingModal from '../components/BillingModal';

interface Invoice {
  id: string;
  fecha: string;
  tipo: string;
  numero: string;
  total: number;
  cliente_id: string;
  t_clientes?: {
    razon_social: string;
  };
  t_comprobante_cobros?: {
    importe: number;
  }[];
  estado?: string;
}

interface EstadoComprobante {
  comprobante_id: string;
  estado_guardado: string;
  trabajo_id: string | null;
  estado_real: 'pendiente' | 'parcial' | 'cobrado' | 'anulado';
  total_cobrado_real: number;
  saldo_pendiente_real: number;
}

const BillingPage: React.FC = () => {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [estados, setEstados] = useState<Record<string, EstadoComprobante>>({});
  const [facturasArcaMap, setFacturasArcaMap] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [facturandoId, setFacturandoId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | undefined>(undefined);

  const [stats, setStats] = useState({
    totalMonth: 0,
    pendingTotal: 0,
  });

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    try {
      const [
        { data, error },
        { data: estadoData, error: estadoError },
        { data: facturasArcaData, error: facturasArcaError }
      ] = await Promise.all([
        supabase
          .from('t_comprobantes')
          .select(`
            *,
            t_clientes (razon_social),
            t_comprobante_cobros (importe)
          `)
          .order('fecha', { ascending: false }),
        supabase.from('v_estado_comprobantes').select('*'),
        supabase
          .from('facturas_arca')
          .select('venta_id, cae, numero_comprobante, punto_venta, cae_vencimiento, estado')
          .eq('estado', 'aprobada')
      ]);

      if (error) throw error;
      if (estadoError) throw estadoError;
      if (facturasArcaError) throw facturasArcaError;

      const invoicesData = data || [];
      setInvoices(invoicesData);

      const estadoMap: Record<string, EstadoComprobante> = {};
      (estadoData || []).forEach((e: EstadoComprobante) => {
        estadoMap[e.comprobante_id] = e;
      });
      setEstados(estadoMap);

      const arcaMap: Record<string, any> = {};
      (facturasArcaData || []).forEach((f: any) => {
        arcaMap[f.venta_id] = f;
      });
      setFacturasArcaMap(arcaMap);

      // Calculate Stats
      const now = new Date();
      const currentMonth = now.getMonth();
      const currentYear = now.getFullYear();

      let monthSum = 0;
      let pendingSum = 0;

      invoicesData.forEach(inv => {
        const invDate = new Date(inv.fecha);
        if (invDate.getMonth() === currentMonth && invDate.getFullYear() === currentYear) {
          monthSum += Number(inv.total);
        }

        const estado = estadoMap[inv.id];
        const pendiente = estado ? Number(estado.saldo_pendiente_real) : Number(inv.total);
        pendingSum += Math.max(0, pendiente);
      });

      setStats({
        totalMonth: monthSum,
        pendingTotal: pendingSum,
      });

    } catch (error: any) {
      toast.error('Error al cargar comprobantes: ' + error.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  const getStatus = (inv: Invoice) => {
    const estado = estados[inv.id];
    const estadoReal = estado?.estado_real ?? (inv.estado === 'anulado' ? 'anulado' : 'pendiente');

    const labels: Record<string, string> = {
      cobrado: 'Cobrado',
      parcial: 'Parcial',
      pendiente: 'Pendiente',
      anulado: 'Anulado',
    };
    const colors: Record<string, string> = {
      cobrado: 'bg-emerald-500/10 text-emerald-700',
      parcial: 'bg-blue-500/10 text-blue-700',
      pendiente: 'bg-amber-500/10 text-amber-700',
      anulado: 'bg-slate-500/10 text-slate-700',
    };

    return {
      label: labels[estadoReal],
      color: colors[estadoReal],
      isPaid: estadoReal === 'cobrado',
    };
  };

  const handleDelete = async (id: string, number: string) => {
    if (!window.confirm(`¿Estás seguro de eliminar el comprobante ${number}? Esta acción no se puede deshacer.`)) return;

    try {
      const { error } = await supabase
        .from('t_comprobantes')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast.success('Comprobante eliminado');
      fetchInvoices();
    } catch (err: any) {
      toast.error('Error al eliminar: ' + err.message);
    }
  };

  const handleFacturarArca = async (trabajoId: string, comprobanteId: string) => {
    setFacturandoId(comprobanteId);
    const toastId = toast.loading('Facturando ante ARCA/AFIP, puede tardar unos segundos...');
    try {
      const response = await fetch('https://arca.srv1055314.hstgr.cloud/api/facturar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ventaId: trabajoId,
          localId: 'principal',
          supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Error al facturar ante ARCA');
      }

      toast.success(`Factura autorizada. CAE: ${result.factura.cae}`, { id: toastId });
      fetchInvoices();
    } catch (err: any) {
      console.error('Error facturando ARCA:', err);
      const isConfigError = err.message?.includes('ARCA no esta configurado para esta sucursal');
      if (isConfigError) {
        toast.error(
          (t) => (
            <div className="flex flex-col gap-2">
              <span className="font-semibold text-xs">{err.message}</span>
              <Link
                to="/configuracion/arca"
                onClick={() => toast.dismiss(t.id)}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white font-bold rounded-lg text-[9px] uppercase tracking-wider hover:bg-blue-700 transition-colors shadow-sm self-start"
              >
                <span className="material-symbols-outlined text-xs font-black">settings</span>
                Configurar ARCA
              </Link>
            </div>
          ),
          { id: toastId, duration: 10000 }
        );
      } else {
        toast.error('Error al facturar: ' + err.message, { id: toastId, duration: 8000 });
      }
    } finally {
      setFacturandoId(null);
    }
  };

  const filteredInvoices = invoices.filter(inv => 
    inv.t_clientes?.razon_social.toLowerCase().includes(searchTerm.toLowerCase()) ||
    inv.numero.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="max-w-7xl mx-auto space-y-10 animate-in fade-in duration-700 pb-20">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <nav className="flex gap-2 text-[10px] text-on-surface-variant mb-2 font-bold tracking-[0.15em] uppercase">
            <span>Administración</span>
            <span className="text-outline/40">/</span>
            <span className="text-primary">Comprobantes</span>
          </nav>
          <h2 className="text-4xl font-headline font-extrabold text-on-surface tracking-tight">Comprobantes</h2>
        </div>
        <div className="flex gap-3">
          <button className="flex items-center gap-2 px-6 py-2.5 bg-surface-container-lowest text-secondary font-bold rounded-xl border border-outline-variant/20 hover:bg-surface-container-low transition-all active:scale-95 text-sm">
            <span className="material-symbols-outlined text-[1.2rem]">download</span>
            Exportar CSV
          </button>
        </div>
      </div>

      {/* Bento Filters Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="md:col-span-2 bg-surface-container-lowest p-5 rounded-2xl shadow-sm border border-outline-variant/10 group hover:border-primary/20 transition-all">
          <label className="block text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-2 px-1">Buscar por Cliente o Número</label>
          <div className="relative">
            <input 
              type="text"
              placeholder="Ej: Editorial Horizonte o 0001-..."
              className="w-full bg-surface-container-low border-none rounded-xl py-2.5 px-10 text-sm focus:ring-2 focus:ring-primary/20 transition-all"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-lg">search</span>
          </div>
        </div>
        
        <div className="md:col-span-2 bg-surface-container-lowest p-5 rounded-2xl shadow-sm border border-outline-variant/10 group hover:border-primary/20 transition-all flex flex-col justify-between">
          <label className="block text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-2 px-1">Filtrar por Fecha</label>
          <div className="flex items-center gap-3">
            <div className="flex-1 relative">
              <input className="w-full bg-surface-container-low border-none rounded-lg py-2 px-3 text-sm focus:ring-2 focus:ring-primary/20 transition-all" type="date" />
            </div>
            <span className="text-on-surface-variant font-bold text-xs">a</span>
            <div className="flex-1 relative">
              <input className="w-full bg-surface-container-low border-none rounded-lg py-2 px-3 text-sm focus:ring-2 focus:ring-primary/20 transition-all" type="date" />
            </div>
          </div>
        </div>
      </div>

      {/* Main Table Section */}
      <div className="bg-white rounded-[2rem] shadow-sm overflow-hidden border border-outline-variant/10">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-container-low/30 font-bold">
                <th className="px-8 py-5 text-[10px] text-on-surface-variant uppercase tracking-widest">Fecha</th>
                <th className="px-6 py-5 text-[10px] text-on-surface-variant uppercase tracking-widest">Tipo</th>
                <th className="px-6 py-5 text-[10px] text-on-surface-variant uppercase tracking-widest">Número</th>
                <th className="px-6 py-5 text-[10px] text-on-surface-variant uppercase tracking-widest">Cliente</th>
                <th className="px-6 py-5 text-[10px] text-on-surface-variant uppercase tracking-widest text-right">Total (AR$)</th>
                <th className="px-6 py-5 text-[10px] text-on-surface-variant uppercase tracking-widest">Estado Pago</th>
                <th className="px-6 py-5 text-[10px] text-on-surface-variant uppercase tracking-widest text-center">ARCA / AFIP</th>
                <th className="px-8 py-5 text-[10px] text-on-surface-variant uppercase tracking-widest text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/5">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-8 py-20 text-center">
                    <div className="flex flex-col items-center justify-center space-y-4">
                      <div className="w-10 h-10 border-4 border-primary/10 border-t-primary rounded-full animate-spin"></div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/50">Consultando Comprobantes...</p>
                    </div>
                  </td>
                </tr>
              ) : filteredInvoices.map((inv) => {
                const status = getStatus(inv);
                const estado = estados[inv.id];
                const trabajoId = estado?.trabajo_id;
                const isFacturable = trabajoId && inv.tipo.toLowerCase().startsWith('factura');
                const facturaArca = trabajoId ? facturasArcaMap[trabajoId] : null;

                return (
                  <tr key={inv.id} className="hover:bg-surface-container-low transition-colors group cursor-pointer">
                    <td className="px-8 py-5 text-sm font-medium">{new Date(inv.fecha).toLocaleDateString()}</td>
                    <td className="px-6 py-5 text-sm text-on-surface-variant">{inv.tipo}</td>
                    <td className="px-6 py-5 text-sm font-headline font-bold text-primary group-hover:underline">{(inv.numero || 'S/N').toUpperCase()}</td>
                    <td className="px-6 py-5 text-sm font-medium">{inv.t_clientes?.razon_social}</td>
                    <td className="px-6 py-5 text-sm font-extrabold text-right text-on-surface">
                      $ {Number(inv.total).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-6 py-5">
                      <span className={`px-3 py-1 text-[10px] font-bold uppercase rounded-full tracking-wider ${status.color}`}>
                        {status.label}
                      </span>
                    </td>
                    <td className="px-6 py-5 text-center" onClick={(e) => e.stopPropagation()}>
                      {isFacturable ? (
                        facturaArca ? (
                          <div className="inline-flex flex-col items-center">
                            <span className="text-[10px] font-mono font-bold text-on-surface-variant leading-none">
                              PV {String(facturaArca.punto_venta || 0).padStart(4, '0')} - Nº {String(facturaArca.numero_comprobante || 0).padStart(8, '0')}
                            </span>
                            <span className="mt-1.5 px-2 py-0.5 text-[9px] font-black uppercase rounded bg-emerald-500/10 text-emerald-700 border border-emerald-500/25 tracking-wider leading-none">
                              CAE: {facturaArca.cae}
                            </span>
                          </div>
                        ) : (
                          <button
                            onClick={() => handleFacturarArca(trabajoId, inv.id)}
                            disabled={facturandoId === inv.id}
                            title="Facturar con ARCA/AFIP"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-500/10 hover:bg-blue-600 text-blue-700 hover:text-white font-bold rounded-xl border border-transparent hover:border-blue-500/20 transition-all active:scale-95 text-[10px] uppercase tracking-widest disabled:opacity-50"
                          >
                            {facturandoId === inv.id ? (
                              <span className="material-symbols-outlined text-sm animate-spin leading-none">sync</span>
                            ) : (
                              <span className="material-symbols-outlined text-sm font-black leading-none">receipt_long</span>
                            )}
                            <span>Facturar ARCA</span>
                          </button>
                        )
                      ) : (
                        <span className="text-xs text-outline/30 italic">No facturable</span>
                      )}
                    </td>
                    <td className="px-8 py-5">
                      <div className="flex items-center justify-center gap-2">
                        <button 
                          onClick={(e) => { 
                            e.stopPropagation(); 
                            setSelectedInvoiceId(inv.id);
                            setIsEditModalOpen(true);
                          }}
                          title="Editar / Cambiar Estado"
                          className="p-2 hover:bg-primary/5 text-primary rounded-lg transition-colors border border-transparent hover:border-primary/10 bg-white"
                        >
                          <span className="material-symbols-outlined text-lg">edit</span>
                        </button>
                        <button 
                          onClick={(e) => { e.stopPropagation(); handleDelete(inv.id, inv.numero); }}
                          title="Eliminar"
                          className="p-2 hover:bg-error/5 text-error rounded-lg transition-colors border border-transparent hover:border-error/10 bg-white"
                        >
                          <span className="material-symbols-outlined text-lg">delete</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!loading && filteredInvoices.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-8 py-20 text-center text-on-surface-variant/50 italic text-sm">
                    No se encontraron comprobantes que coincidan con la búsqueda.
                  </td>
                </tr>
              )}
            </tbody>

          </table>
        </div>
      </div>

      {/* Footer Summary Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 bg-gradient-to-br from-primary to-primary-container p-8 rounded-[2.5rem] text-white flex flex-col md:flex-row justify-between items-center relative overflow-hidden shadow-2xl shadow-primary/20">
          <div className="relative z-10 space-y-1">
            <p className="text-primary-fixed/60 text-[10px] font-bold uppercase tracking-[0.2em]">Total Facturado Mes</p>
            <h3 className="text-5xl font-headline font-extrabold tracking-tight">
              $ {stats.totalMonth.toLocaleString('es-AR')}<span className="text-2xl text-primary-fixed/40">,00</span>
            </h3>
          </div>
          <div className="bg-white/10 backdrop-blur-md p-5 rounded-2xl relative z-10 border border-white/10 mt-6 md:mt-0">
             <p className="text-[10px] text-white/50 uppercase font-bold tracking-widest leading-none mb-1">Cierre en tiempo real</p>
             <div className="flex items-center gap-2 text-emerald-300">
               <span className="material-symbols-outlined text-sm font-bold">sync</span>
               <span className="text-sm font-black">Actualizado</span>
             </div>
          </div>
          <div className="absolute -right-16 -bottom-16 w-80 h-80 bg-white/5 rounded-full blur-3xl"></div>
        </div>

        <div className="bg-surface-container-highest p-8 rounded-[2.5rem] flex flex-col justify-center border border-primary/10 shadow-sm group hover:scale-[1.02] transition-transform duration-500">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center group-hover:bg-primary group-hover:text-white transition-all duration-300">
              <span className="material-symbols-outlined text-primary group-hover:text-white text-2xl transition-colors">account_balance_wallet</span>
            </div>
            <div>
              <p className="text-[10px] text-secondary font-black uppercase tracking-widest mb-1">Pendiente de Cobro</p>
              <h4 className="text-3xl font-headline font-extrabold text-on-surface">$ {stats.pendingTotal.toLocaleString('es-AR')}</h4>
            </div>
          </div>
          <div className="w-full bg-surface-container-low h-2.5 rounded-full overflow-hidden border border-outline-variant/5">
            <div 
              className="bg-primary h-full rounded-full shadow-inner transition-all duration-1000" 
              style={{ width: stats.totalMonth > 0 ? `${Math.min(100, (1 - stats.pendingTotal / stats.totalMonth) * 100)}%` : '100%' }}
            ></div>
          </div>
        </div>
      </div>

      {/* Edit Modal */}
      {isEditModalOpen && selectedInvoiceId && (
        <BillingModal 
          existingInvoiceId={selectedInvoiceId}
          onClose={() => {
            setIsEditModalOpen(false);
            setSelectedInvoiceId(undefined);
          }}
          onSuccess={fetchInvoices}
        />
      )}
    </div>
  );
};

export default BillingPage;
