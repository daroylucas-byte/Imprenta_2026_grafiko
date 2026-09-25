import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { todayAR, formatDateAR } from '../utils/dates';
import { toast } from 'react-hot-toast';
import PurchaseModal from '../components/PurchaseModal';
import PurchaseDetailModal, { type CompraRow } from '../components/PurchaseDetailModal';

const normalizeText = (s: unknown) =>
  String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

interface SupplierOption {
  id: string;
  nombre: string;
}

const PurchasesPage: React.FC = () => {
  const [purchases, setPurchases] = useState<CompraRow[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [loading, setLoading] = useState(true);

  // Modales
  const [isPurchaseModalOpen, setIsPurchaseModalOpen] = useState(false);
  const [selectedPurchase, setSelectedPurchase] = useState<CompraRow | null>(null);

  // Filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'todas' | 'recibidas' | 'anuladas'>('todas');
  const [supplierFilter, setSupplierFilter] = useState('');
  const [desdeFilter, setDesdeFilter] = useState('');
  const [hastaFilter, setHastaFilter] = useState('');

  const fetchSuppliers = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('t_proveedores')
        .select('id, nombre')
        .order('nombre', { ascending: true });

      if (error) throw error;
      setSuppliers(data || []);
    } catch (err: any) {
      console.error('Error fetching suppliers list:', err);
    }
  }, []);

  const fetchPurchases = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('v_compras')
        .select('*')
        .order('fecha', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(300);

      if (supplierFilter) {
        query = query.eq('proveedor_id', supplierFilter);
      }

      if (desdeFilter) {
        query = query.gte('fecha', desdeFilter);
      }

      if (hastaFilter) {
        query = query.lte('fecha', hastaFilter);
      }

      const { data, error } = await query;
      if (error) throw error;

      setPurchases((data || []) as CompraRow[]);
    } catch (err: any) {
      console.error('Error fetching purchases:', err);
      toast.error('Error al cargar compras: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [supplierFilter, desdeFilter, hastaFilter]);

  useEffect(() => {
    fetchPurchases();
    fetchSuppliers();
  }, [fetchPurchases, fetchSuppliers]);

  // Buscador de texto libre
  const purchaseMatchesSearch = (p: CompraRow) => {
    const words = normalizeText(searchTerm).split(/\s+/).filter(Boolean);
    if (words.length === 0) return true;
    const haystack = normalizeText(
      [p.proveedor_nombre, p.nro_comprobante, p.observaciones]
        .filter((v) => v !== null && v !== undefined && v !== '')
        .join(' ')
    );
    return words.every((w) => haystack.includes(w));
  };

  const filteredPurchases = purchases.filter((p) => {
    if (activeTab === 'recibidas' && p.estado !== 'recibida') return false;
    if (activeTab === 'anuladas' && p.estado !== 'anulada') return false;
    return purchaseMatchesSearch(p);
  });

  // Métricas del mes actual (según todayAR())
  const currentMonthPrefix = todayAR().substring(0, 7); // 'YYYY-MM'
  const currentMonthPurchases = purchases.filter(
    (p) => p.fecha && p.fecha.startsWith(currentMonthPrefix)
  );

  const totalMesRecibidas = currentMonthPurchases
    .filter((p) => p.estado !== 'anulada')
    .reduce((acc, p) => acc + Number(p.total || 0), 0);

  const cantPendientesPagoMes = currentMonthPurchases.filter(
    (p) => p.estado !== 'anulada' && p.condicion_pago === 'cuenta_corriente'
  ).length;

  const cantAnuladasMes = currentMonthPurchases.filter((p) => p.estado === 'anulada').length;

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in duration-700">
      {/* Metrics Section */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Compras del Mes */}
        <div className="bg-surface-container-lowest p-8 rounded-[2rem] border border-outline-variant/10 shadow-sm flex flex-col justify-between group hover:border-primary/20 transition-all">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white transition-all">
              <span className="material-symbols-outlined">shopping_cart</span>
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
                Compras del Mes
              </p>
              <h3 className="text-2xl lg:text-3xl font-headline font-extrabold text-on-surface">
                ${totalMesRecibidas.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
              </h3>
            </div>
          </div>
          <p className="text-[10px] font-bold text-outline uppercase tracking-wider">
            Total facturado en el mes en curso
          </p>
        </div>

        {/* Pendientes de Pago (Cuenta Corriente) */}
        <div className="bg-surface-container-lowest p-8 rounded-[2rem] border border-outline-variant/10 shadow-sm flex flex-col justify-between group hover:border-amber-500/20 transition-all">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 flex items-center justify-center text-amber-600 group-hover:bg-amber-500 group-hover:text-white transition-all">
              <span className="material-symbols-outlined">pending_actions</span>
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
                A Cuenta Corriente
              </p>
              <h3 className="text-3xl font-headline font-extrabold text-on-surface">
                {cantPendientesPagoMes}
              </h3>
            </div>
          </div>
          <p className="text-[10px] font-bold text-outline uppercase tracking-wider">
            Compras a crédito del mes
          </p>
        </div>

        {/* Compras Anuladas */}
        <div className="bg-surface-container-lowest p-8 rounded-[2rem] border border-outline-variant/10 shadow-sm flex flex-col justify-between group hover:border-error/20 transition-all">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 rounded-2xl bg-error/10 flex items-center justify-center text-error group-hover:bg-error group-hover:text-white transition-all">
              <span className="material-symbols-outlined">block</span>
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
                Anuladas en el Mes
              </p>
              <h3
                className={`text-3xl font-headline font-extrabold ${
                  cantAnuladasMes > 0 ? 'text-error' : 'text-on-surface'
                }`}
              >
                {cantAnuladasMes}
              </h3>
            </div>
          </div>
          <p className="text-[10px] font-bold text-outline uppercase tracking-wider">
            Operaciones canceladas
          </p>
        </div>

        {/* Card Acción Nueva Compra */}
        <div
          className="bg-gradient-to-br from-slate-900 to-slate-800 p-8 rounded-[2rem] shadow-xl flex items-center justify-between group cursor-pointer hover:scale-[0.98] transition-all"
          onClick={() => setIsPurchaseModalOpen(true)}
        >
          <div className="text-white space-y-1">
            <h4 className="text-lg font-headline font-extrabold tracking-tight">Nueva Compra</h4>
            <p className="text-slate-400 text-xs font-bold uppercase tracking-widest leading-none">
              Ingreso de insumos
            </p>
          </div>
          <div className="w-14 h-14 bg-white/10 rounded-2xl flex items-center justify-center text-white backdrop-blur-md group-hover:bg-primary transition-colors">
            <span className="material-symbols-outlined text-3xl">add_shopping_cart</span>
          </div>
        </div>
      </div>

      {/* Main Table Section */}
      <div className="bg-surface-container-lowest rounded-[2.5rem] shadow-sm border border-outline-variant/10 overflow-hidden">
        {/* Header con Buscador y Botón */}
        <div className="p-8 border-b border-outline-variant/5 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-4">
            <div>
              <h2 className="text-2xl font-headline font-extrabold text-on-surface tracking-tight">
                Registro de Compras
              </h2>
              <p className="text-[10px] text-outline font-bold uppercase tracking-wider mt-0.5">
                Historial de facturas y remitos de proveedores
              </p>
            </div>
            <button
              onClick={() => setIsPurchaseModalOpen(true)}
              className="hidden sm:flex items-center gap-2 px-4 py-2 bg-primary text-white text-xs font-bold rounded-xl shadow-md shadow-primary/20 hover:brightness-110 active:scale-95 transition-all"
            >
              <span className="material-symbols-outlined text-sm">add</span>
              Nueva Compra
            </button>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-4 w-full md:w-auto">
            {/* Buscador */}
            <div className="relative w-full sm:w-80 md:w-96">
              <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant">
                search
              </span>
              <input
                className="w-full bg-surface-container-low border-none rounded-2xl pl-12 pr-6 py-3 text-sm font-bold focus:ring-2 focus:ring-primary/20 transition-all shadow-inner"
                placeholder="Buscar por proveedor, N° de comprobante u observaciones..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Filtros: Pestañas + Select Proveedor + Fechas Desde / Hasta */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between px-8 py-3 bg-white border-b border-outline-variant/5 gap-4">
          <div className="flex">
            <button
              onClick={() => setActiveTab('todas')}
              className={`px-6 py-3 text-[10px] font-black uppercase tracking-[0.2em] transition-all border-b-2 ${
                activeTab === 'todas'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-outline'
              }`}
            >
              Todas ({purchases.length})
            </button>
            <button
              onClick={() => setActiveTab('recibidas')}
              className={`px-6 py-3 text-[10px] font-black uppercase tracking-[0.2em] transition-all border-b-2 ${
                activeTab === 'recibidas'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-outline'
              }`}
            >
              Recibidas ({purchases.filter((p) => p.estado === 'recibida').length})
            </button>
            <button
              onClick={() => setActiveTab('anuladas')}
              className={`px-6 py-3 text-[10px] font-black uppercase tracking-[0.2em] transition-all border-b-2 ${
                activeTab === 'anuladas'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-outline'
              }`}
            >
              Anuladas ({purchases.filter((p) => p.estado === 'anulada').length})
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Select Proveedor */}
            <select
              value={supplierFilter}
              onChange={(e) => setSupplierFilter(e.target.value)}
              className="bg-surface-container-low border-none rounded-xl px-4 py-2 text-xs font-bold text-on-surface focus:ring-2 focus:ring-primary/20 appearance-none cursor-pointer"
            >
              <option value="">Todos los proveedores</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </select>

            {/* Fechas */}
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={desdeFilter}
                onChange={(e) => setDesdeFilter(e.target.value)}
                title="Fecha desde"
                className="bg-surface-container-low border-none rounded-xl px-3 py-2 text-xs font-bold text-on-surface focus:ring-2 focus:ring-primary/20 shadow-inner"
              />
              <span className="text-xs text-outline font-bold">a</span>
              <input
                type="date"
                value={hastaFilter}
                onChange={(e) => setHastaFilter(e.target.value)}
                title="Fecha hasta"
                className="bg-surface-container-low border-none rounded-xl px-3 py-2 text-xs font-bold text-on-surface focus:ring-2 focus:ring-primary/20 shadow-inner"
              />
            </div>
          </div>
        </div>

        {/* Tabla de Compras */}
        <div className="overflow-x-auto no-scrollbar">
          {loading ? (
            <div className="h-64 flex flex-col items-center justify-center space-y-4 text-primary/30">
              <div className="w-10 h-10 border-4 border-primary/10 border-t-primary rounded-full animate-spin"></div>
              <p className="text-[10px] font-black uppercase tracking-widest">Cargando compras...</p>
            </div>
          ) : (
            <table className="w-full text-left border-collapse min-w-[950px]">
              <thead>
                <tr className="bg-surface-container-low/30">
                  <th className="px-8 py-5 text-[10px] font-black text-on-surface-variant uppercase tracking-widest">
                    Fecha
                  </th>
                  <th className="px-6 py-5 text-[10px] font-black text-on-surface-variant uppercase tracking-widest">
                    Proveedor
                  </th>
                  <th className="px-6 py-5 text-[10px] font-black text-on-surface-variant uppercase tracking-widest">
                    N° Comprobante
                  </th>
                  <th className="px-6 py-5 text-[10px] font-black text-on-surface-variant uppercase tracking-widest">
                    Condición de Pago
                  </th>
                  <th className="px-6 py-5 text-[10px] font-black text-on-surface-variant uppercase tracking-widest text-center">
                    Ítems
                  </th>
                  <th className="px-6 py-5 text-[10px] font-black text-on-surface-variant uppercase tracking-widest text-right">
                    Total
                  </th>
                  <th className="px-8 py-5 text-[10px] font-black text-on-surface-variant uppercase tracking-widest text-center">
                    Estado
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/5">
                {filteredPurchases.map((compra, i) => {
                  const isAnulada = compra.estado === 'anulada';
                  const totalNum = Number(compra.total || 0);

                  return (
                    <tr
                      key={compra.id}
                      onClick={() => setSelectedPurchase(compra)}
                      className={`hover:bg-surface-container-high transition-colors group cursor-pointer animate-in fade-in slide-in-from-right-4 duration-300 ${
                        isAnulada ? 'opacity-70 bg-slate-50/50' : ''
                      }`}
                      style={{ animationDelay: `${Math.min(i * 20, 300)}ms` }}
                    >
                      {/* Fecha */}
                      <td className="px-8 py-5 text-sm font-bold text-on-surface whitespace-nowrap">
                        {formatDateAR(compra.fecha)}
                      </td>

                      {/* Proveedor */}
                      <td className="px-6 py-5">
                        <p className="text-sm font-headline font-extrabold text-on-surface group-hover:text-primary transition-colors">
                          {compra.proveedor_nombre}
                        </p>
                        {compra.observaciones && (
                          <p className="text-[10px] text-outline font-medium line-clamp-1 mt-0.5">
                            {compra.observaciones}
                          </p>
                        )}
                      </td>

                      {/* N° Comprobante */}
                      <td className="px-6 py-5 text-xs font-bold text-secondary">
                        {compra.nro_comprobante || '—'}
                      </td>

                      {/* Condición de Pago */}
                      <td className="px-6 py-5">
                        <span
                          className={`px-2.5 py-1 text-[9px] font-black uppercase rounded-lg border tracking-widest inline-block ${
                            compra.condicion_pago === 'cuenta_corriente'
                              ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                              : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          }`}
                        >
                          {compra.condicion_pago === 'cuenta_corriente'
                            ? 'Cuenta corriente'
                            : `Contado · ${compra.forma_pago || 'Efectivo'}`}
                        </span>
                      </td>

                      {/* Cantidad de Ítems */}
                      <td className="px-6 py-5 text-center text-xs font-bold text-on-surface">
                        {compra.cantidad_items || 1} ítem(s)
                      </td>

                      {/* Total */}
                      <td className="px-6 py-5 text-right whitespace-nowrap">
                        <p
                          className={`text-sm font-black ${
                            isAnulada ? 'line-through text-outline' : 'text-on-surface'
                          }`}
                        >
                          ${totalNum.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                        </p>
                      </td>

                      {/* Estado */}
                      <td className="px-8 py-5 text-center">
                        <span
                          className={`px-2.5 py-1 text-[9px] font-black uppercase rounded-lg border tracking-widest inline-block ${
                            isAnulada
                              ? 'bg-error/10 text-error border-error/20'
                              : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          }`}
                        >
                          {isAnulada ? 'Anulada' : 'Recibida'}
                        </span>
                      </td>
                    </tr>
                  );
                })}

                {!loading && filteredPurchases.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-20 text-center text-outline/40 italic text-sm">
                      {searchTerm
                        ? `No se encontraron compras para la búsqueda "${searchTerm}"`
                        : supplierFilter
                        ? 'No hay compras registradas para este proveedor'
                        : activeTab === 'recibidas'
                        ? 'No hay compras recibidas'
                        : activeTab === 'anuladas'
                        ? 'No hay compras anuladas'
                        : 'No hay compras registradas'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Modal de Registro de Nueva Compra */}
      {isPurchaseModalOpen && (
        <PurchaseModal
          onClose={() => setIsPurchaseModalOpen(false)}
          onSuccess={fetchPurchases}
        />
      )}

      {/* Modal de Detalle / Anulación de Compra */}
      {selectedPurchase && (
        <PurchaseDetailModal
          purchase={selectedPurchase}
          onClose={() => setSelectedPurchase(null)}
          onSuccess={fetchPurchases}
        />
      )}
    </div>
  );
};

export default PurchasesPage;
