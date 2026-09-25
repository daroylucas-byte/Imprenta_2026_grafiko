import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { toast } from 'react-hot-toast';

export interface MovimientoStock {
  id: string;
  insumo_id: string;
  insumo_nombre: string;
  unidad_stock_nombre: string;
  tipo: 'entrada' | 'salida' | 'ajuste' | 'devolucion';
  cantidad: number;
  stock_anterior: number;
  stock_nuevo: number;
  motivo?: string | null;
  referencia_tipo?: string | null;
  referencia_id?: string | null;
  usuario_id?: string | null;
  created_at: string;
}

interface InsumoOption {
  id: string;
  nombre: string;
}

interface StockHistoryPanelProps {
  initialInsumoId?: string;
}

const TIPO_BADGES: Record<string, { label: string; classes: string }> = {
  entrada: {
    label: 'Entrada',
    classes: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  salida: {
    label: 'Salida',
    classes: 'bg-error/10 text-error border-error/20',
  },
  ajuste: {
    label: 'Ajuste',
    classes: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  devolucion: {
    label: 'Devolución',
    classes: 'bg-sky-50 text-sky-700 border-sky-200',
  },
};

const StockHistoryPanel: React.FC<StockHistoryPanelProps> = ({ initialInsumoId }) => {
  const [movimientos, setMovimientos] = useState<MovimientoStock[]>([]);
  const [insumosList, setInsumosList] = useState<InsumoOption[]>([]);
  const [loading, setLoading] = useState(true);

  // Filtros
  const [insumoFilter, setInsumoFilter] = useState<string>(initialInsumoId || '');
  const [tipoFilter, setTipoFilter] = useState<string>('');
  const [desdeFilter, setDesdeFilter] = useState<string>('');
  const [hastaFilter, setHastaFilter] = useState<string>('');

  // Cargar lista de insumos para el filtro
  useEffect(() => {
    const fetchInsumos = async () => {
      try {
        const { data, error } = await supabase
          .from('t_insumos')
          .select('id, nombre')
          .order('nombre', { ascending: true });

        if (error) throw error;
        setInsumosList(data || []);
      } catch (err: any) {
        console.error('Error fetching insumos list:', err);
      }
    };
    fetchInsumos();
  }, []);

  // Si cambia el initialInsumoId desde props, actualizar el filtro
  useEffect(() => {
    if (initialInsumoId) {
      setInsumoFilter(initialInsumoId);
    }
  }, [initialInsumoId]);

  const fetchMovimientos = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('v_movimientos_stock')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(300);

      if (insumoFilter) {
        query = query.eq('insumo_id', insumoFilter);
      }

      if (tipoFilter) {
        query = query.eq('tipo', tipoFilter);
      }

      if (desdeFilter) {
        query = query.gte('created_at', `${desdeFilter}T00:00:00-03:00`);
      }

      if (hastaFilter) {
        query = query.lte('created_at', `${hastaFilter}T23:59:59.999-03:00`);
      }

      const { data, error } = await query;
      if (error) throw error;

      setMovimientos((data || []) as MovimientoStock[]);
    } catch (err: any) {
      console.error('Error fetching movimientos:', err);
      toast.error('Error al cargar historial de movimientos: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [insumoFilter, tipoFilter, desdeFilter, hastaFilter]);

  useEffect(() => {
    fetchMovimientos();
  }, [fetchMovimientos]);

  const handleResetFilters = () => {
    setInsumoFilter('');
    setTipoFilter('');
    setDesdeFilter('');
    setHastaFilter('');
  };

  const hasActiveFilters = Boolean(insumoFilter || tipoFilter || desdeFilter || hastaFilter);

  return (
    <div className="space-y-6">
      {/* Panel de Filtros */}
      <div className="bg-surface-container-lowest p-6 sm:p-8 rounded-[2.5rem] shadow-sm border border-outline-variant/10">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
          <div>
            <h3 className="text-xl font-headline font-extrabold text-on-surface tracking-tight">
              Filtros de Historial
            </h3>
            <p className="text-[10px] font-bold text-outline uppercase tracking-wider mt-0.5">
              Filtrá por insumo, tipo de operación o rango de fechas
            </p>
          </div>
          {hasActiveFilters && (
            <button
              onClick={handleResetFilters}
              className="text-xs font-bold text-primary hover:underline flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-sm">filter_alt_off</span>
              Limpiar filtros
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Filtro Insumo */}
          <div className="space-y-1">
            <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">
              Insumo
            </label>
            <select
              value={insumoFilter}
              onChange={(e) => setInsumoFilter(e.target.value)}
              className="w-full bg-surface-container-low border-none rounded-2xl py-3 px-4 text-xs font-bold focus:ring-2 focus:ring-primary/20 appearance-none cursor-pointer"
            >
              <option value="">Todos los insumos</option>
              {insumosList.map((ins) => (
                <option key={ins.id} value={ins.id}>
                  {ins.nombre}
                </option>
              ))}
            </select>
          </div>

          {/* Filtro Tipo */}
          <div className="space-y-1">
            <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">
              Tipo de Operación
            </label>
            <select
              value={tipoFilter}
              onChange={(e) => setTipoFilter(e.target.value)}
              className="w-full bg-surface-container-low border-none rounded-2xl py-3 px-4 text-xs font-bold focus:ring-2 focus:ring-primary/20 appearance-none cursor-pointer"
            >
              <option value="">Todos los tipos</option>
              <option value="entrada">Entrada</option>
              <option value="salida">Salida</option>
              <option value="ajuste">Ajuste</option>
              <option value="devolucion">Devolución</option>
            </select>
          </div>

          {/* Fecha Desde */}
          <div className="space-y-1">
            <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">
              Fecha Desde
            </label>
            <input
              type="date"
              value={desdeFilter}
              onChange={(e) => setDesdeFilter(e.target.value)}
              className="w-full bg-surface-container-low border-none rounded-2xl py-3 px-4 text-xs font-bold focus:ring-2 focus:ring-primary/20 shadow-inner"
            />
          </div>

          {/* Fecha Hasta */}
          <div className="space-y-1">
            <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">
              Fecha Hasta
            </label>
            <input
              type="date"
              value={hastaFilter}
              onChange={(e) => setHastaFilter(e.target.value)}
              className="w-full bg-surface-container-low border-none rounded-2xl py-3 px-4 text-xs font-bold focus:ring-2 focus:ring-primary/20 shadow-inner"
            />
          </div>
        </div>
      </div>

      {/* Aviso de límite de 300 */}
      {movimientos.length === 300 && (
        <div className="px-6 py-3 bg-indigo-50 border border-indigo-100 rounded-2xl flex items-center justify-between text-indigo-900 text-xs font-bold">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-indigo-600 text-sm">info</span>
            <span>Mostrando los últimos 300 movimientos. Usá los filtros de fecha para acotar la búsqueda.</span>
          </div>
        </div>
      )}

      {/* Tabla de Movimientos */}
      <div className="bg-surface-container-lowest rounded-[2.5rem] shadow-sm border border-outline-variant/10 overflow-hidden">
        <div className="overflow-x-auto no-scrollbar">
          {loading ? (
            <div className="h-64 flex flex-col items-center justify-center space-y-4 text-primary/30">
              <div className="w-10 h-10 border-4 border-primary/10 border-t-primary rounded-full animate-spin"></div>
              <p className="text-[10px] font-black uppercase tracking-widest">Cargando movimientos...</p>
            </div>
          ) : (
            <table className="w-full text-left border-collapse min-w-[950px]">
              <thead>
                <tr className="bg-surface-container-low/30">
                  <th className="px-8 py-5 text-[10px] font-black text-on-surface-variant uppercase tracking-widest">
                    Fecha y Hora
                  </th>
                  <th className="px-6 py-5 text-[10px] font-black text-on-surface-variant uppercase tracking-widest">
                    Insumo
                  </th>
                  <th className="px-6 py-5 text-[10px] font-black text-on-surface-variant uppercase tracking-widest">
                    Tipo
                  </th>
                  <th className="px-6 py-5 text-[10px] font-black text-on-surface-variant uppercase tracking-widest text-right">
                    Cantidad / Dif.
                  </th>
                  <th className="px-6 py-5 text-[10px] font-black text-on-surface-variant uppercase tracking-widest">
                    Balance Stock
                  </th>
                  <th className="px-6 py-5 text-[10px] font-black text-on-surface-variant uppercase tracking-widest">
                    Motivo
                  </th>
                  <th className="px-8 py-5 text-[10px] font-black text-on-surface-variant uppercase tracking-widest">
                    Origen
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/5">
                {movimientos.map((mov, i) => {
                  const badgeInfo = TIPO_BADGES[mov.tipo] || {
                    label: mov.tipo,
                    classes: 'bg-slate-100 text-slate-700 border-slate-200',
                  };

                  const stockAntNum = Number(mov.stock_anterior || 0);
                  const stockNuevoNum = Number(mov.stock_nuevo || 0);
                  const cantNum = Number(mov.cantidad || 0);

                  // Cantidad con signo
                  let cantDisplay = '';
                  let cantClass = 'text-on-surface';

                  if (mov.tipo === 'entrada' || mov.tipo === 'devolucion') {
                    cantDisplay = `+${cantNum.toLocaleString('es-AR', { maximumFractionDigits: 3 })}`;
                    cantClass = 'text-emerald-600';
                  } else if (mov.tipo === 'salida') {
                    cantDisplay = `−${cantNum.toLocaleString('es-AR', { maximumFractionDigits: 3 })}`;
                    cantClass = 'text-error';
                  } else if (mov.tipo === 'ajuste') {
                    const diff = stockNuevoNum - stockAntNum;
                    cantDisplay = `${diff >= 0 ? '+' : '−'}${Math.abs(diff).toLocaleString('es-AR', {
                      maximumFractionDigits: 3,
                    })}`;
                    cantClass = diff > 0 ? 'text-emerald-600' : diff < 0 ? 'text-error' : 'text-on-surface-variant';
                  }

                  const fechaHoraStr = new Date(mov.created_at).toLocaleString('es-AR', {
                    timeZone: 'America/Argentina/Buenos_Aires',
                  });

                  const origenStr =
                    mov.referencia_tipo === 'manual'
                      ? 'Manual'
                      : mov.referencia_tipo === 'compra'
                      ? 'Compra'
                      : mov.referencia_tipo || 'Manual';

                  return (
                    <tr
                      key={mov.id}
                      className="hover:bg-surface-container-high transition-colors group animate-in fade-in slide-in-from-right-4 duration-300"
                      style={{ animationDelay: `${Math.min(i * 15, 300)}ms` }}
                    >
                      {/* Fecha y Hora */}
                      <td className="px-8 py-4 text-xs font-bold text-on-surface whitespace-nowrap">
                        {fechaHoraStr}
                      </td>

                      {/* Insumo */}
                      <td className="px-6 py-4">
                        <p className="text-sm font-headline font-extrabold text-on-surface">
                          {mov.insumo_nombre}
                        </p>
                      </td>

                      {/* Tipo */}
                      <td className="px-6 py-4">
                        <span
                          className={`px-2.5 py-1 text-[9px] font-black uppercase rounded-lg border tracking-widest inline-block ${badgeInfo.classes}`}
                        >
                          {badgeInfo.label}
                        </span>
                      </td>

                      {/* Cantidad con signo */}
                      <td className="px-6 py-4 text-right whitespace-nowrap">
                        <span className={`text-sm font-black ${cantClass}`}>
                          {cantDisplay} {mov.unidad_stock_nombre}
                        </span>
                      </td>

                      {/* Balance Stock: Anterior -> Nuevo */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-1 text-xs font-bold text-on-surface">
                          <span className="text-outline">
                            {stockAntNum.toLocaleString('es-AR', { maximumFractionDigits: 3 })}
                          </span>
                          <span className="material-symbols-outlined text-xs text-outline">arrow_forward</span>
                          <span className="font-black text-primary">
                            {stockNuevoNum.toLocaleString('es-AR', { maximumFractionDigits: 3 })}
                          </span>
                          <span className="text-[10px] text-outline font-bold">
                            {mov.unidad_stock_nombre}
                          </span>
                        </div>
                      </td>

                      {/* Motivo */}
                      <td className="px-6 py-4">
                        <p className="text-xs font-bold text-on-surface line-clamp-2 max-w-xs">
                          {mov.motivo || '—'}
                        </p>
                      </td>

                      {/* Origen */}
                      <td className="px-8 py-4 text-xs font-bold text-secondary">
                        <span className="px-2 py-0.5 bg-surface-container-low rounded-md border border-outline-variant/10 text-[10px]">
                          {origenStr}
                        </span>
                      </td>
                    </tr>
                  );
                })}

                {!loading && movimientos.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-20 text-center text-outline/40 italic text-sm">
                      {hasActiveFilters
                        ? 'No hay movimientos con estos filtros'
                        : 'Todavía no hay movimientos de stock registrados'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer info */}
        <div className="p-6 bg-surface-container-low/30 border-t border-outline-variant/5 flex items-center gap-2 text-outline text-xs">
          <span className="material-symbols-outlined text-base">info</span>
          <span>
            Los movimientos no se pueden editar ni borrar. Si algo está mal, se corrige registrando un ajuste de stock.
          </span>
        </div>
      </div>
    </div>
  );
};

export default StockHistoryPanel;
