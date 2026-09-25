import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { toast } from 'react-hot-toast';
import InsumoModal from '../components/InsumoModal';
import StockMovementModal, { type InsumoStock } from '../components/StockMovementModal';
import StockHistoryPanel from '../components/StockHistoryPanel';

const normalizeText = (s: unknown) =>
  String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

interface CategoriaOption {
  id: string;
  nombre: string;
}

const InsumosPage: React.FC = () => {
  const [tab, setTab] = useState<'insumos' | 'historial'>('insumos');
  const [insumos, setInsumos] = useState<InsumoStock[]>([]);
  const [categorias, setCategorias] = useState<CategoriaOption[]>([]);
  const [loading, setLoading] = useState(true);

  // Modales
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedInsumoId, setSelectedInsumoId] = useState<string | null>(null);
  const [isMovementModalOpen, setIsMovementModalOpen] = useState(false);
  const [activeInsumoForMovement, setActiveInsumoForMovement] = useState<InsumoStock | null>(null);

  // Filtros de listado
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'activos' | 'inactivos' | 'todos'>('activos');
  const [categoriaFilter, setCategoriaFilter] = useState<string>('');
  const [soloAlertas, setSoloAlertas] = useState(false);

  // Filtro de insumo al saltar a historial
  const [historyInsumoId, setHistoryInsumoId] = useState<string | undefined>(undefined);

  const fetchCategorias = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('t_conf_categorias_insumo')
        .select('id, nombre')
        .order('nombre', { ascending: true });

      if (error) throw error;
      setCategorias(data || []);
    } catch (err: any) {
      console.error('Error cargando categorías de insumo:', err);
    }
  }, []);

  const fetchInsumos = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('v_insumos_stock')
        .select('*')
        .order('nombre', { ascending: true });

      if (error) throw error;
      setInsumos((data || []) as InsumoStock[]);
    } catch (error: any) {
      toast.error('Error al cargar insumos: ' + error.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInsumos();
    fetchCategorias();
  }, [fetchInsumos, fetchCategorias]);

  const handleToggleActivo = async (insumo: InsumoStock) => {
    const nuevoEstado = !insumo.activo;
    if (
      nuevoEstado === false &&
      !window.confirm(
        `¿Inactivar el insumo ${insumo.nombre}? No podrás seleccionarlo para nuevos movimientos, pero su historial se conserva intacto.`
      )
    ) {
      return;
    }

    try {
      const { error } = await supabase
        .from('t_insumos')
        .update({ activo: nuevoEstado })
        .eq('id', insumo.id);

      if (error) throw error;
      toast.success(nuevoEstado ? 'Insumo reactivado' : 'Insumo inactivado');
      fetchInsumos();
    } catch (error: any) {
      toast.error('Error al actualizar insumo: ' + error.message);
    }
  };

  const handleVerHistorialInsumo = (insumoId: string) => {
    setHistoryInsumoId(insumoId);
    setTab('historial');
  };

  const insumoMatchesSearch = (i: InsumoStock) => {
    const words = normalizeText(searchTerm).split(/\s+/).filter(Boolean);
    if (words.length === 0) return true;
    const haystack = normalizeText(
      [i.nombre, i.codigo, i.categoria_nombre, i.observaciones]
        .filter((v) => v !== null && v !== undefined && v !== '')
        .join(' ')
    );
    return words.every((w) => haystack.includes(w));
  };

  const filteredInsumos = insumos.filter((i) => {
    if (activeTab === 'activos' && i.activo === false) return false;
    if (activeTab === 'inactivos' && i.activo !== false) return false;
    if (categoriaFilter && i.categoria_id !== categoriaFilter) return false;
    if (soloAlertas && !i.bajo_minimo && !i.stock_negativo) return false;
    return insumoMatchesSearch(i);
  });

  // Métricas
  const activeInsumosList = insumos.filter((i) => i.activo !== false);
  const totalActiveInsumos = activeInsumosList.length;
  const cantStockBajo = activeInsumosList.filter((i) => i.bajo_minimo && !i.stock_negativo).length;
  const cantStockNegativo = activeInsumosList.filter((i) => i.stock_negativo).length;
  const totalValorStock = activeInsumosList.reduce((acc, i) => {
    const stockNum = Number(i.stock || 0);
    const valorNum = Number(i.valor_stock || 0);
    return stockNum > 0 && valorNum > 0 ? acc + valorNum : acc;
  }, 0);

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in duration-700">
      {/* Tabs Principales: Insumos / Historial */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex gap-2">
          {(
            [
              ['insumos', 'Insumos y Stock', 'inventory_2'],
              ['historial', 'Historial de Movimientos', 'history'],
            ] as const
          ).map(([id, label, icon]) => (
            <button
              key={id}
              onClick={() => {
                if (id === 'insumos') setHistoryInsumoId(undefined);
                setTab(id);
              }}
              className={`flex items-center gap-2 px-6 py-3 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${
                tab === id
                  ? 'bg-primary text-white shadow-lg shadow-primary/20'
                  : 'bg-white text-on-surface-variant border border-outline-variant/10 hover:bg-primary/10'
              }`}
            >
              <span className="material-symbols-outlined text-lg">{icon}</span>
              {label}
            </button>
          ))}
        </div>

        {tab === 'insumos' && (
          <button
            onClick={() => {
              setSelectedInsumoId(null);
              setIsModalOpen(true);
            }}
            className="flex items-center gap-2 px-5 py-3 bg-primary text-white text-xs font-bold rounded-2xl shadow-lg shadow-primary/20 hover:brightness-110 active:scale-95 transition-all"
          >
            <span className="material-symbols-outlined text-base">add</span>
            Nuevo Insumo
          </button>
        )}
      </div>

      {tab === 'historial' ? (
        <StockHistoryPanel initialInsumoId={historyInsumoId} />
      ) : (
        <div className="space-y-8">
          {/* Metrics Section */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {/* Insumos Activos */}
            <div className="bg-surface-container-lowest p-8 rounded-[2rem] border border-outline-variant/10 shadow-sm flex flex-col justify-between group hover:border-primary/20 transition-all">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white transition-all">
                  <span className="material-symbols-outlined">inventory_2</span>
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
                    Insumos Activos
                  </p>
                  <h3 className="text-3xl font-headline font-extrabold text-on-surface">
                    {totalActiveInsumos}
                  </h3>
                </div>
              </div>
              <p className="text-[10px] font-bold text-outline uppercase tracking-wider">
                Total en catálogo de insumos
              </p>
            </div>

            {/* Stock Bajo */}
            <div className="bg-surface-container-lowest p-8 rounded-[2rem] border border-outline-variant/10 shadow-sm flex flex-col justify-between group hover:border-amber-500/20 transition-all">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 rounded-2xl bg-amber-500/10 flex items-center justify-center text-amber-600 group-hover:bg-amber-500 group-hover:text-white transition-all">
                  <span className="material-symbols-outlined">warning</span>
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
                    Con Stock Bajo
                  </p>
                  <h3
                    className={`text-3xl font-headline font-extrabold ${
                      cantStockBajo > 0 ? 'text-amber-600' : 'text-on-surface'
                    }`}
                  >
                    {cantStockBajo}
                  </h3>
                </div>
              </div>
              <p className="text-[10px] font-bold text-outline uppercase tracking-wider">
                Por debajo del mínimo fijado
              </p>
            </div>

            {/* Stock Negativo */}
            <div className="bg-surface-container-lowest p-8 rounded-[2rem] border border-outline-variant/10 shadow-sm flex flex-col justify-between group hover:border-error/20 transition-all">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 rounded-2xl bg-error/10 flex items-center justify-center text-error group-hover:bg-error group-hover:text-white transition-all">
                  <span className="material-symbols-outlined">error</span>
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
                    Stock Negativo
                  </p>
                  <h3
                    className={`text-3xl font-headline font-extrabold ${
                      cantStockNegativo > 0 ? 'text-error' : 'text-on-surface'
                    }`}
                  >
                    {cantStockNegativo}
                  </h3>
                </div>
              </div>
              <p className="text-[10px] font-bold text-outline uppercase tracking-wider">
                Insumos con balance en rojo
              </p>
            </div>

            {/* Valor Total del Stock */}
            <div className="bg-gradient-to-br from-slate-900 to-slate-800 p-8 rounded-[2rem] shadow-xl flex flex-col justify-between text-white group">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center text-white backdrop-blur-md">
                  <span className="material-symbols-outlined">payments</span>
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                    Valor del Stock
                  </p>
                  <h3 className="text-2xl lg:text-3xl font-headline font-extrabold text-white">
                    ${totalValorStock.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                  </h3>
                </div>
              </div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Valoración a último costo de compra
              </p>
            </div>
          </div>

          {/* Main Table Section */}
          <div className="bg-surface-container-lowest rounded-[2.5rem] shadow-sm border border-outline-variant/10 overflow-hidden">
            {/* Header con Buscador */}
            <div className="p-8 border-b border-outline-variant/5 flex flex-col md:flex-row justify-between items-center gap-6">
              <div className="flex items-center gap-4">
                <div>
                  <h2 className="text-2xl font-headline font-extrabold text-on-surface tracking-tight">
                    Catálogo de Insumos
                  </h2>
                  <p className="text-[10px] text-outline font-bold uppercase tracking-wider mt-0.5">
                    Papeles, tintas, planchas y materias primas
                  </p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-4 w-full md:w-auto">
                {/* Buscador */}
                <div className="relative w-full sm:w-80 md:w-96">
                  <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant">
                    search
                  </span>
                  <input
                    className="w-full bg-surface-container-low border-none rounded-2xl pl-12 pr-6 py-3 text-sm font-bold focus:ring-2 focus:ring-primary/20 transition-all shadow-inner"
                    placeholder="Buscar por nombre, código o categoría..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* Filtros: Tabs + Select Categoría + Checkbox Solo Alertas */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between px-8 py-3 bg-white border-b border-outline-variant/5 gap-4">
              <div className="flex">
                <button
                  onClick={() => setActiveTab('activos')}
                  className={`px-6 py-3 text-[10px] font-black uppercase tracking-[0.2em] transition-all border-b-2 ${
                    activeTab === 'activos'
                      ? 'border-primary text-primary'
                      : 'border-transparent text-outline'
                  }`}
                >
                  Activos ({insumos.filter((i) => i.activo !== false).length})
                </button>
                <button
                  onClick={() => setActiveTab('inactivos')}
                  className={`px-6 py-3 text-[10px] font-black uppercase tracking-[0.2em] transition-all border-b-2 ${
                    activeTab === 'inactivos'
                      ? 'border-primary text-primary'
                      : 'border-transparent text-outline'
                  }`}
                >
                  Inactivos ({insumos.filter((i) => i.activo === false).length})
                </button>
                <button
                  onClick={() => setActiveTab('todos')}
                  className={`px-6 py-3 text-[10px] font-black uppercase tracking-[0.2em] transition-all border-b-2 ${
                    activeTab === 'todos'
                      ? 'border-primary text-primary'
                      : 'border-transparent text-outline'
                  }`}
                >
                  Todos ({insumos.length})
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-4">
                {/* Select Categoría */}
                <select
                  value={categoriaFilter}
                  onChange={(e) => setCategoriaFilter(e.target.value)}
                  className="bg-surface-container-low border-none rounded-xl px-4 py-2 text-xs font-bold text-on-surface focus:ring-2 focus:ring-primary/20 appearance-none cursor-pointer"
                >
                  <option value="">Todas las categorías</option>
                  {categorias.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.nombre}
                    </option>
                  ))}
                </select>

                {/* Checkbox Solo Alertas */}
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={soloAlertas}
                    onChange={(e) => setSoloAlertas(e.target.checked)}
                    className="w-4 h-4 rounded text-primary focus:ring-primary/20 border-outline-variant/30"
                  />
                  <span className="text-xs font-bold text-on-surface-variant">Solo con alertas</span>
                </label>
              </div>
            </div>

            {/* Tabla de Insumos */}
            <div className="overflow-x-auto no-scrollbar">
              {loading ? (
                <div className="h-64 flex flex-col items-center justify-center space-y-4 text-primary/30">
                  <div className="w-10 h-10 border-4 border-primary/10 border-t-primary rounded-full animate-spin"></div>
                  <p className="text-[10px] font-black uppercase tracking-widest">Sincronizando Insumos...</p>
                </div>
              ) : (
                <table className="w-full text-left border-collapse min-w-[950px]">
                  <thead>
                    <tr className="bg-surface-container-low/30">
                      <th className="px-8 py-5 text-[10px] font-black text-on-surface-variant uppercase tracking-widest">
                        Insumo / Código
                      </th>
                      <th className="px-6 py-5 text-[10px] font-black text-on-surface-variant uppercase tracking-widest">
                        Categoría
                      </th>
                      <th className="px-6 py-5 text-[10px] font-black text-on-surface-variant uppercase tracking-widest">
                        Stock Actual
                      </th>
                      <th className="px-6 py-5 text-[10px] font-black text-on-surface-variant uppercase tracking-widest">
                        Mínimo
                      </th>
                      <th className="px-6 py-5 text-[10px] font-black text-on-surface-variant uppercase tracking-widest">
                        Último Costo
                      </th>
                      <th className="px-6 py-5 text-[10px] font-black text-on-surface-variant uppercase tracking-widest">
                        Estado
                      </th>
                      <th className="px-8 py-5 text-[10px] font-black text-on-surface-variant uppercase tracking-widest text-center">
                        Acciones
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/5">
                    {filteredInsumos.map((insumo, i) => {
                      const stockNum = Number(insumo.stock || 0);
                      const stockMinimoNum = Number(insumo.stock_minimo || 0);
                      const ultimoCostoNum = Number(insumo.ultimo_costo_compra || 0);
                      const hasUnidadCompra = Boolean(insumo.unidad_compra_id && insumo.unidad_compra_nombre);

                      return (
                        <tr
                          key={insumo.id}
                          className="hover:bg-surface-container-high transition-colors group animate-in fade-in slide-in-from-right-4 duration-300"
                          style={{ animationDelay: `${Math.min(i * 20, 300)}ms` }}
                        >
                          {/* Insumo y Código */}
                          <td className="px-8 py-5">
                            <p className="text-sm font-headline font-extrabold text-on-surface group-hover:text-primary transition-colors">
                              {insumo.nombre}
                            </p>
                            {insumo.codigo && (
                              <span className="inline-block mt-1 px-2 py-0.5 bg-surface-container-low rounded-md text-[10px] font-bold text-outline uppercase tracking-wider border border-outline-variant/10">
                                {insumo.codigo}
                              </span>
                            )}
                            {insumo.observaciones && (
                              <p className="text-[10px] text-outline font-medium line-clamp-1 mt-0.5">
                                {insumo.observaciones}
                              </p>
                            )}
                          </td>

                          {/* Categoría */}
                          <td className="px-6 py-5">
                            <span className="text-xs font-bold text-secondary">
                              {insumo.categoria_nombre || 'Sin categoría'}
                            </span>
                          </td>

                          {/* Stock Actual */}
                          <td className="px-6 py-5">
                            <div>
                              <p
                                className={`text-sm font-black ${
                                  insumo.stock_negativo
                                    ? 'text-error'
                                    : insumo.bajo_minimo
                                    ? 'text-amber-600'
                                    : 'text-on-surface'
                                }`}
                              >
                                {stockNum.toLocaleString('es-AR', { maximumFractionDigits: 3 })}{' '}
                                <span className="text-xs font-bold text-on-surface-variant">
                                  {insumo.unidad_stock_nombre}
                                </span>
                              </p>
                              {hasUnidadCompra &&
                                insumo.stock_en_unidad_compra !== null &&
                                insumo.stock_en_unidad_compra !== undefined && (
                                  <p className="text-[11px] font-bold text-outline mt-0.5">
                                    ={' '}
                                    {Number(insumo.stock_en_unidad_compra).toLocaleString('es-AR', {
                                      maximumFractionDigits: 3,
                                    })}{' '}
                                    {insumo.unidad_compra_nombre}
                                  </p>
                                )}
                            </div>
                          </td>

                          {/* Stock Mínimo */}
                          <td className="px-6 py-5 text-xs font-bold text-on-surface">
                            {stockMinimoNum > 0 ? (
                              <span>
                                {stockMinimoNum.toLocaleString('es-AR', { maximumFractionDigits: 3 })}{' '}
                                <span className="text-[10px] text-outline">{insumo.unidad_stock_nombre}</span>
                              </span>
                            ) : (
                              <span className="text-outline/50">—</span>
                            )}
                          </td>

                          {/* Último Costo */}
                          <td className="px-6 py-5">
                            <p className="text-xs font-black text-on-surface">
                              ${ultimoCostoNum.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                            </p>
                            <p className="text-[9px] font-bold text-outline">
                              / {hasUnidadCompra ? insumo.unidad_compra_nombre : insumo.unidad_stock_nombre}
                            </p>
                          </td>

                          {/* Estado / Alertas */}
                          <td className="px-6 py-5">
                            {insumo.activo === false ? (
                              <span className="px-2.5 py-1 text-[9px] font-black uppercase rounded-lg border tracking-widest bg-slate-100 text-slate-600 border-slate-200">
                                Inactivo
                              </span>
                            ) : insumo.stock_negativo ? (
                              <span className="px-2.5 py-1 text-[9px] font-black uppercase rounded-lg border tracking-widest bg-error/10 text-error border-error/20 inline-flex items-center gap-1">
                                <span className="material-symbols-outlined text-[11px]">error</span>
                                Stock negativo
                              </span>
                            ) : insumo.bajo_minimo ? (
                              <span className="px-2.5 py-1 text-[9px] font-black uppercase rounded-lg border tracking-widest bg-amber-50 text-amber-700 border-amber-200 inline-flex items-center gap-1">
                                <span className="material-symbols-outlined text-[11px]">warning</span>
                                Stock bajo
                              </span>
                            ) : (
                              <span className="px-2.5 py-1 text-[9px] font-black uppercase rounded-lg border tracking-widest bg-emerald-50 text-emerald-700 border-emerald-200 inline-flex items-center gap-1">
                                <span className="material-symbols-outlined text-[11px]">check</span>
                                Normal
                              </span>
                            )}
                          </td>

                          {/* Acciones */}
                          <td className="px-8 py-5 text-center">
                            <div className="flex justify-center items-center gap-2">
                              {/* Registrar Movimiento */}
                              <button
                                onClick={() => {
                                  setActiveInsumoForMovement(insumo);
                                  setIsMovementModalOpen(true);
                                }}
                                title="Registrar Movimiento de Stock"
                                className="bg-emerald-50 text-emerald-600 hover:bg-emerald-600 hover:text-white transition-all p-2 rounded-xl border border-emerald-100 shadow-sm"
                              >
                                <span className="material-symbols-outlined text-lg">swap_horiz</span>
                              </button>

                              {/* Ver Historial */}
                              <button
                                onClick={() => handleVerHistorialInsumo(insumo.id)}
                                title="Ver Historial de Movimientos"
                                className="bg-indigo-50 text-indigo-600 hover:bg-indigo-600 hover:text-white transition-all p-2 rounded-xl border border-indigo-100 shadow-sm"
                              >
                                <span className="material-symbols-outlined text-lg">history</span>
                              </button>

                              {/* Editar Insumo */}
                              <button
                                onClick={() => {
                                  setSelectedInsumoId(insumo.id);
                                  setIsModalOpen(true);
                                }}
                                title="Editar Insumo"
                                className="bg-slate-50 text-slate-600 hover:bg-primary hover:text-white transition-all p-2 rounded-xl border border-slate-100 shadow-sm"
                              >
                                <span className="material-symbols-outlined text-lg">edit</span>
                              </button>

                              {/* Inactivar / Reactivar */}
                              <button
                                onClick={() => handleToggleActivo(insumo)}
                                title={insumo.activo !== false ? 'Inactivar Insumo' : 'Reactivar Insumo'}
                                className={
                                  insumo.activo !== false
                                    ? 'bg-error/5 text-error hover:bg-error hover:text-white transition-all p-2 rounded-xl border border-error/10 shadow-sm'
                                    : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-600 hover:text-white transition-all p-2 rounded-xl border border-emerald-100 shadow-sm'
                                }
                              >
                                <span className="material-symbols-outlined text-lg">
                                  {insumo.activo !== false ? 'block' : 'check_circle'}
                                </span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}

                    {!loading && filteredInsumos.length === 0 && (
                      <tr>
                        <td colSpan={7} className="py-20 text-center text-outline/40 italic text-sm">
                          {searchTerm
                            ? `No se encontraron insumos para la búsqueda "${searchTerm}"`
                            : soloAlertas
                            ? 'No hay insumos con alertas de stock'
                            : categoriaFilter
                            ? 'No hay insumos en esta categoría'
                            : activeTab === 'activos'
                            ? 'No hay insumos activos'
                            : activeTab === 'inactivos'
                            ? 'No hay insumos inactivos'
                            : 'No hay insumos registrados'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>

            {/* Footer de ayuda discreto */}
            <div className="p-6 bg-surface-container-low/30 border-t border-outline-variant/5 flex items-center justify-between text-outline text-xs">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-base">settings</span>
                <span>Unidades de medida y categorías se administran en Configuración → Compras.</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Alta / Edición de Insumo */}
      {isModalOpen && (
        <InsumoModal
          insumoId={selectedInsumoId || undefined}
          onClose={() => {
            setIsModalOpen(false);
            setSelectedInsumoId(null);
          }}
          onSuccess={fetchInsumos}
        />
      )}

      {/* Modal de Registro de Movimiento */}
      {isMovementModalOpen && activeInsumoForMovement && (
        <StockMovementModal
          insumo={activeInsumoForMovement}
          onClose={() => {
            setIsMovementModalOpen(false);
            setActiveInsumoForMovement(null);
          }}
          onSuccess={fetchInsumos}
        />
      )}
    </div>
  );
};

export default InsumosPage;
