import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { toast } from 'react-hot-toast';

interface DesgloseMetodo {
  metodo: string;
  ingresos: number;
  egresos: number;
  neto: number;
}

interface Cierre {
  id: string;
  fecha_apertura: string;
  fecha_cierre: string;
  created_at: string;
  cerrada_at: string | null;
  saldo_inicio: number;
  saldo_cierre: number | null;
  efectivo_esperado: number | null;
  diferencia: number | null;
  total_ingresos: number | null;
  total_egresos: number | null;
  total_retiros: number | null;
  desglose_metodos: DesgloseMetodo[] | null;
}

interface MovimientoDetalle {
  id: string;
  tipo: 'ingreso' | 'egreso';
  categoria: string;
  metodo: string;
  monto: number;
  descripcion: string;
  created_at: string;
  t_conf_tipos_gasto: any;
}

const CATEGORIA_LABELS: Record<string, { label: string; classes: string }> = {
  cobro: { label: 'Cobro', classes: 'bg-emerald-50 text-emerald-600 border-emerald-100' },
  ingreso_extra: { label: 'Ingreso extra', classes: 'bg-sky-50 text-sky-600 border-sky-100' },
  gasto: { label: 'Gasto', classes: 'bg-error/5 text-error border-error/10' },
  retiro: { label: 'Retiro', classes: 'bg-amber-50 text-amber-600 border-amber-100' },
};

const money = (n: number | null | undefined) =>
  n === null || n === undefined ? '—' : `$${Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`;

const dateTime = (c: Cierre) =>
  c.cerrada_at
    ? new Date(c.cerrada_at).toLocaleString('es-AR')
    : new Date(c.fecha_cierre + 'T00:00:00').toLocaleDateString('es-AR');

const DiffBadge: React.FC<{ value: number | null }> = ({ value }) => {
  if (value === null || value === undefined) return <span className="text-outline/50 text-xs">—</span>;
  if (Math.abs(value) < 0.005) return <span className="text-xs font-black text-on-surface-variant">Sin diferencia</span>;
  return value > 0
    ? <span className="text-xs font-black text-emerald-600">+{money(value)} sobrante</span>
    : <span className="text-xs font-black text-error">-{money(Math.abs(value))} faltante</span>;
};

const CierreDetalleModal: React.FC<{ cierre: Cierre; onClose: () => void }> = ({ cierre, onClose }) => {
  const [retiros, setRetiros] = useState<MovimientoDetalle[]>([]);
  const [loading, setLoading] = useState(true);
  const [movs, setMovs] = useState<MovimientoDetalle[] | null>(null);
  const [verMovs, setVerMovs] = useState(false);
  const [loadingMovs, setLoadingMovs] = useState(false);

  const SELECT_MOV = 'id, tipo, categoria, metodo, monto, descripcion, created_at, t_conf_tipos_gasto(nombre)';

  // Los retiros se cargan siempre (son pocos); la lista completa solo si se expande.
  useEffect(() => {
    supabase
      .from('t_movimientos_caja')
      .select(SELECT_MOV)
      .eq('apertura_caja_id', cierre.id)
      .eq('categoria', 'retiro')
      .order('created_at', { ascending: true })
      .then(({ data, error }) => {
        if (error) toast.error('Error al cargar retiros del turno: ' + error.message);
        setRetiros((data as any) || []);
        setLoading(false);
      });
  }, [cierre.id]);

  const toggleMovs = async () => {
    const abrir = !verMovs;
    setVerMovs(abrir);
    if (abrir && movs === null) {
      setLoadingMovs(true);
      const { data, error } = await supabase
        .from('t_movimientos_caja')
        .select(SELECT_MOV)
        .eq('apertura_caja_id', cierre.id)
        .order('created_at', { ascending: true });
      if (error) toast.error('Error al cargar movimientos del turno: ' + error.message);
      setMovs((data as any) || []);
      setLoadingMovs(false);
    }
  };

  const desglose = cierre.desglose_metodos || [];

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300">
      <div className="bg-white w-full max-w-3xl max-h-[90vh] rounded-[2.5rem] shadow-2xl border border-white/20 flex flex-col overflow-hidden">
        <div className="px-10 py-8 border-b border-outline-variant/10 flex justify-between items-center bg-slate-50 shrink-0">
          <div>
            <h3 className="text-2xl font-headline font-extrabold text-on-surface tracking-tight">Detalle del Cierre</h3>
            <p className="text-[10px] font-black text-outline uppercase tracking-widest mt-1">{dateTime(cierre)}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-error/10 text-on-surface-variant hover:text-error rounded-full transition-all">
            <span className="material-symbols-outlined text-2xl">close</span>
          </button>
        </div>

        <div className="p-10 space-y-8 overflow-y-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Efectivo inicial', value: money(cierre.saldo_inicio) },
              { label: 'Efectivo esperado', value: money(cierre.efectivo_esperado) },
              { label: 'Efectivo contado', value: money(cierre.saldo_cierre) },
              { label: 'Retiro', value: money(cierre.total_retiros) },
            ].map(c => (
              <div key={c.label} className="bg-slate-50 p-4 rounded-2xl border border-outline-variant/10">
                <p className="text-[9px] font-black text-on-surface-variant uppercase tracking-widest">{c.label}</p>
                <p className="text-lg font-headline font-extrabold text-on-surface mt-1">{c.value}</p>
              </div>
            ))}
          </div>

          <div className="flex justify-between items-center bg-slate-50 p-5 rounded-2xl border border-outline-variant/10">
            <span className="text-xs font-black uppercase tracking-widest text-on-surface">Diferencia del arqueo</span>
            <DiffBadge value={cierre.diferencia} />
          </div>

          <div className="space-y-3">
            <h4 className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest">Recaudación por medio de pago</h4>
            {desglose.length === 0 ? (
              <p className="text-xs text-outline/60 italic">Este cierre es anterior al historial detallado, no tiene desglose guardado.</p>
            ) : (
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-outline-variant/10">
                    <th className="pb-2 text-[10px] font-black text-on-surface-variant uppercase tracking-widest">Medio</th>
                    <th className="pb-2 text-[10px] font-black text-on-surface-variant uppercase tracking-widest text-right">Ingresos</th>
                    <th className="pb-2 text-[10px] font-black text-on-surface-variant uppercase tracking-widest text-right">Egresos</th>
                    <th className="pb-2 text-[10px] font-black text-on-surface-variant uppercase tracking-widest text-right">Neto</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/5">
                  {desglose.map(d => (
                    <tr key={d.metodo}>
                      <td className="py-3 text-sm font-bold text-on-surface">{d.metodo}</td>
                      <td className="py-3 text-sm font-bold text-emerald-600 text-right">{money(d.ingresos)}</td>
                      <td className="py-3 text-sm font-bold text-error text-right">{money(d.egresos)}</td>
                      <td className="py-3 text-sm font-black text-on-surface text-right">{money(d.neto)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="space-y-3">
            <h4 className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest">Retiros de caja</h4>
            {loading ? (
              <p className="text-xs text-outline/60 italic">Cargando...</p>
            ) : retiros.length === 0 ? (
              <p className="text-xs text-outline/60 italic">No hubo retiros en este turno.</p>
            ) : (
              retiros.map(r => (
                <div key={r.id} className="flex justify-between items-center bg-amber-50/60 p-4 rounded-2xl border border-amber-100">
                  <span className="text-sm font-bold text-on-surface">{r.descripcion}</span>
                  <span className="text-sm font-black text-amber-700">-{money(r.monto)}</span>
                </div>
              ))
            )}
          </div>

          <div className="space-y-3">
            <button
              type="button"
              onClick={toggleMovs}
              className="w-full flex justify-between items-center bg-slate-50 hover:bg-slate-100 p-4 rounded-2xl border border-outline-variant/10 transition-colors"
            >
              <span className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest">
                {verMovs ? 'Ocultar movimientos del turno' : 'Ver todos los movimientos del turno'}
              </span>
              <span className="material-symbols-outlined text-on-surface-variant">{verMovs ? 'expand_less' : 'expand_more'}</span>
            </button>
            {verMovs && loadingMovs && <p className="text-xs text-outline/60 italic">Cargando movimientos...</p>}
            {verMovs && movs && movs.length === 0 && <p className="text-xs text-outline/60 italic">Este turno no tuvo movimientos.</p>}
            {verMovs && movs && movs.length > 0 && (
              <div className="divide-y divide-outline-variant/5 max-h-96 overflow-y-auto">
                {movs.map(m => {
                  const cat = CATEGORIA_LABELS[m.categoria] || CATEGORIA_LABELS.cobro;
                  const tipoGasto = Array.isArray(m.t_conf_tipos_gasto) ? m.t_conf_tipos_gasto[0] : m.t_conf_tipos_gasto;
                  return (
                    <div key={m.id} className="py-3 flex justify-between items-center gap-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 text-[9px] font-black uppercase rounded-lg tracking-widest border ${cat.classes}`}>{cat.label}</span>
                          <span className="text-[10px] font-bold text-secondary">{m.metodo}</span>
                          {tipoGasto?.nombre && <span className="text-[10px] font-bold text-outline">· {tipoGasto.nombre}</span>}
                        </div>
                        <p className="text-sm font-bold text-on-surface truncate mt-1">{m.descripcion}</p>
                        <p className="text-[10px] font-bold text-outline">{new Date(m.created_at).toLocaleString('es-AR')}</p>
                      </div>
                      <span className={`text-sm font-black shrink-0 ${m.tipo === 'ingreso' ? 'text-emerald-600' : 'text-error'}`}>
                        {m.tipo === 'ingreso' ? '+' : '-'}{money(m.monto)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const CashClosuresHistory: React.FC = () => {
  const [cierres, setCierres] = useState<Cierre[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Cierre | null>(null);

  const fetchCierres = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('t_aperturas_caja')
      .select('id, fecha_apertura, fecha_cierre, created_at, cerrada_at, saldo_inicio, saldo_cierre, efectivo_esperado, diferencia, total_ingresos, total_egresos, total_retiros, desglose_metodos')
      .not('fecha_cierre', 'is', null)
      .order('cerrada_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) toast.error('Error al cargar el historial de cierres: ' + error.message);
    setCierres((data as any) || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchCierres();
  }, [fetchCierres]);

  return (
    <div className="bg-surface-container-lowest rounded-[2.5rem] shadow-sm border border-outline-variant/10 overflow-hidden">
      <div className="p-8 border-b border-outline-variant/5">
        <h2 className="text-2xl font-headline font-extrabold text-on-surface tracking-tight">Historial de Cierres</h2>
        <p className="text-[10px] text-outline font-bold uppercase tracking-wider mt-0.5">Últimos 100 turnos cerrados — tocá uno para ver el detalle</p>
      </div>
      <div className="overflow-x-auto no-scrollbar">
        <table className="w-full text-left border-collapse min-w-[1050px]">
          <thead>
            <tr className="bg-surface-container-low/30">
              <th className="px-8 py-5 text-[10px] font-black text-on-surface-variant uppercase tracking-widest">Cierre</th>
              <th className="px-6 py-5 text-[10px] font-black text-on-surface-variant uppercase tracking-widest text-right">Esperado (efectivo)</th>
              <th className="px-6 py-5 text-[10px] font-black text-on-surface-variant uppercase tracking-widest text-right">Contado</th>
              <th className="px-6 py-5 text-[10px] font-black text-on-surface-variant uppercase tracking-widest">Diferencia</th>
              <th className="px-6 py-5 text-[10px] font-black text-on-surface-variant uppercase tracking-widest text-right">Ingresos</th>
              <th className="px-6 py-5 text-[10px] font-black text-on-surface-variant uppercase tracking-widest text-right">Gastos</th>
              <th className="px-6 py-5 text-[10px] font-black text-on-surface-variant uppercase tracking-widest text-right">Retiro</th>
              <th className="px-8 py-5 text-[10px] font-black text-on-surface-variant uppercase tracking-widest text-right">Inicia caja siguiente</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/5">
            {loading ? (
              <tr><td colSpan={8} className="py-20 text-center text-outline/40 italic text-sm">Cargando historial...</td></tr>
            ) : cierres.length === 0 ? (
              <tr><td colSpan={8} className="py-20 text-center text-outline/40 italic text-sm">Todavía no hay turnos cerrados</td></tr>
            ) : cierres.map(c => (
              <tr key={c.id} onClick={() => setSelected(c)} className="hover:bg-surface-container-high transition-colors cursor-pointer">
                <td className="px-8 py-5 text-sm font-bold text-on-surface">{dateTime(c)}</td>
                <td className="px-6 py-5 text-sm font-bold text-on-surface text-right">{money(c.efectivo_esperado)}</td>
                <td className="px-6 py-5 text-sm font-bold text-on-surface text-right">{money(c.saldo_cierre)}</td>
                <td className="px-6 py-5"><DiffBadge value={c.diferencia} /></td>
                <td className="px-6 py-5 text-sm font-bold text-emerald-600 text-right">{money(c.total_ingresos)}</td>
                <td className="px-6 py-5 text-sm font-bold text-error text-right">{money(c.total_egresos)}</td>
                <td className="px-6 py-5 text-sm font-black text-amber-700 text-right">{c.total_retiros ? money(c.total_retiros) : '—'}</td>
                <td className="px-8 py-5 text-sm font-black text-on-surface text-right">
                  {c.total_retiros !== null && c.saldo_cierre !== null ? money(Number(c.saldo_cierre) - Number(c.total_retiros)) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {selected && <CierreDetalleModal cierre={selected} onClose={() => setSelected(null)} />}
    </div>
  );
};

export default CashClosuresHistory;
