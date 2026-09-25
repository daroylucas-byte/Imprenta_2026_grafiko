import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { toast } from 'react-hot-toast';

export interface CosteoComponente {
  tipo: 'insumo' | 'servicio' | 'tercerizado' | 'otro';
  ref_id?: string | null;
  nombre: string;
  unidad?: string | null;
  cantidad: number;
  en_unidad_compra?: boolean;
  costo_unitario: number;
}

export interface Costeo {
  margen_pct: number;
  componentes: CosteoComponente[];
}

export interface CostCalculatorModalProps {
  itemLabel: string;
  cantidadItem: number;
  initialCosteo?: Costeo | null;
  onApply: (costeo: Costeo | null, precioTotalSugerido: number | null) => void;
  onClose: () => void;
}

interface InsumoLookUp {
  id: string;
  nombre: string;
  codigo?: string | null;
  unidad_stock_nombre: string;
  unidad_compra_nombre?: string | null;
  factor_compra: number;
  stock: number;
  ultimo_costo_compra: number;
  activo?: boolean;
}

interface ServicioLookUp {
  id: string;
  nombre: string;
  tipo: 'propio' | 'tercerizado';
  costo_unitario: number;
  t_conf_unidades_medida?: any;
}

interface EditableComponente {
  rowId: string;
  tipo: 'insumo' | 'servicio' | 'tercerizado' | 'otro';
  ref_id?: string | null;
  nombre: string;
  unidad?: string | null;
  cantidad: number | string;
  en_unidad_compra?: boolean;
  costo_unitario: number | string;
  insumoSearch?: string;
  isDropdownOpen?: boolean;
}

const CostCalculatorModal: React.FC<CostCalculatorModalProps> = ({
  itemLabel,
  cantidadItem,
  initialCosteo,
  onApply,
  onClose,
}) => {
  const [insumos, setInsumos] = useState<InsumoLookUp[]>([]);
  const [servicios, setServicios] = useState<ServicioLookUp[]>([]);
  const [loadingLookups, setLoadingLookups] = useState(true);

  const [margenPct, setMargenPct] = useState<number | string>(
    initialCosteo?.margen_pct !== undefined && initialCosteo?.margen_pct !== null
      ? initialCosteo.margen_pct
      : 40
  );

  const [componentes, setComponentes] = useState<EditableComponente[]>(() => {
    if (initialCosteo && Array.isArray(initialCosteo.componentes) && initialCosteo.componentes.length > 0) {
      return initialCosteo.componentes.map((c, i) => ({
        rowId: `comp-${Date.now()}-${i}-${Math.random().toString(36).substring(2, 6)}`,
        tipo: c.tipo || 'otro',
        ref_id: c.ref_id || null,
        nombre: c.nombre || '',
        unidad: c.unidad || '',
        cantidad: c.cantidad ?? 1,
        en_unidad_compra: c.en_unidad_compra ?? true,
        costo_unitario: c.costo_unitario ?? 0,
        insumoSearch: c.nombre || '',
        isDropdownOpen: false,
      }));
    }
    return [];
  });

  // Cargar catálogos e inicializar margen por defecto si no vino initialCosteo
  useEffect(() => {
    const fetchCatalogs = async () => {
      setLoadingLookups(true);
      try {
        const [insRes, servRes, configRes] = await Promise.all([
          supabase
            .from('v_insumos_stock')
            .select('id, nombre, codigo, unidad_stock_nombre, unidad_compra_nombre, factor_compra, stock, ultimo_costo_compra, activo')
            .eq('activo', true)
            .order('nombre', { ascending: true }),
          supabase
            .from('t_servicios')
            .select('id, nombre, tipo, costo_unitario, t_conf_unidades_medida(id, nombre)')
            .eq('activo', true)
            .order('nombre', { ascending: true }),
          supabase
            .from('t_config_costeo')
            .select('margen_defecto_pct')
            .eq('id', 1)
            .maybeSingle(),
        ]);

        if (insRes.error) throw insRes.error;
        if (servRes.error) throw servRes.error;

        setInsumos((insRes.data || []) as InsumoLookUp[]);
        setServicios((servRes.data || []) as ServicioLookUp[]);

        if ((!initialCosteo || initialCosteo.margen_pct === undefined) && configRes.data?.margen_defecto_pct !== undefined) {
          setMargenPct(Number(configRes.data.margen_defecto_pct));
        }
      } catch (err: any) {
        console.error('Error loading cost calculator lookups:', err);
        toast.error('Error al cargar datos de insumos y servicios: ' + err.message);
      } finally {
        setLoadingLookups(false);
      }
    };

    fetchCatalogs();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Agregar filas
  const handleAddComponente = (tipo: 'insumo' | 'servicio' | 'tercerizado' | 'otro') => {
    const newId = `comp-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const newComp: EditableComponente = {
      rowId: newId,
      tipo,
      ref_id: null,
      nombre: tipo === 'otro' ? '' : '',
      unidad: '',
      cantidad: 1,
      en_unidad_compra: true,
      costo_unitario: '',
      insumoSearch: '',
      isDropdownOpen: false,
    };
    setComponentes((prev) => [...prev, newComp]);
  };

  const handleRemoveComponente = (rowId: string) => {
    setComponentes((prev) => prev.filter((c) => c.rowId !== rowId));
  };

  const updateComponenteField = (rowId: string, field: keyof EditableComponente, value: any) => {
    setComponentes((prev) =>
      prev.map((c) => (c.rowId === rowId ? { ...c, [field]: value } : c))
    );
  };

  // Al elegir un insumo
  const handleSelectInsumo = (rowId: string, ins: InsumoLookUp) => {
    const hasUnidadCompra = Boolean(ins.unidad_compra_nombre);
    const defaultEnCompra = hasUnidadCompra;
    const factor = Number(ins.factor_compra) || 1;
    const ultimoCostoCompra = Number(ins.ultimo_costo_compra) || 0;

    let preCosto = '';
    if (ultimoCostoCompra > 0) {
      preCosto = defaultEnCompra ? String(ultimoCostoCompra) : String(ultimoCostoCompra / factor);
    }

    const unidadNombre = defaultEnCompra
      ? ins.unidad_compra_nombre || ins.unidad_stock_nombre
      : ins.unidad_stock_nombre;

    setComponentes((prev) =>
      prev.map((c) =>
        c.rowId === rowId
          ? {
              ...c,
              ref_id: ins.id,
              nombre: ins.nombre,
              insumoSearch: ins.nombre,
              isDropdownOpen: false,
              en_unidad_compra: defaultEnCompra,
              unidad: unidadNombre,
              costo_unitario: preCosto,
            }
          : c
      )
    );
  };

  // Alternar unidad compra / stock en insumo
  const handleInsumoUnitToggle = (rowId: string, enCompra: boolean) => {
    setComponentes((prev) =>
      prev.map((c) => {
        if (c.rowId !== rowId) return c;
        const ins = insumos.find((x) => x.id === c.ref_id);
        if (!ins) return { ...c, en_unidad_compra: enCompra };

        const factor = Number(ins.factor_compra) || 1;
        const ultimoCostoCompra = Number(ins.ultimo_costo_compra) || 0;

        let nuevoCosto = c.costo_unitario;
        if (ultimoCostoCompra > 0) {
          nuevoCosto = enCompra ? String(ultimoCostoCompra) : String(ultimoCostoCompra / factor);
        }

        const unidadNombre = enCompra
          ? ins.unidad_compra_nombre || ins.unidad_stock_nombre
          : ins.unidad_stock_nombre;

        return {
          ...c,
          en_unidad_compra: enCompra,
          unidad: unidadNombre,
          costo_unitario: nuevoCosto,
        };
      })
    );
  };

  // Al elegir un servicio
  const handleSelectServicio = (rowId: string, servId: string) => {
    const s = servicios.find((x) => x.id === servId);
    if (!s) return;

    const uNombre = Array.isArray(s.t_conf_unidades_medida)
      ? s.t_conf_unidades_medida[0]?.nombre
      : s.t_conf_unidades_medida?.nombre || null;

    setComponentes((prev) =>
      prev.map((c) =>
        c.rowId === rowId
          ? {
              ...c,
              ref_id: s.id,
              nombre: s.nombre,
              unidad: uNombre,
              costo_unitario: Number(s.costo_unitario || 0),
            }
          : c
      )
    );
  };

  // Cálculos en vivo
  const costoTotal = componentes.reduce((acc, c) => {
    const cant = Number(c.cantidad) || 0;
    const costo = Number(c.costo_unitario) || 0;
    return acc + cant * costo;
  }, 0);

  const numMargen = Math.max(0, Number(margenPct) || 0);
  const precioSugerido = costoTotal * (1 + numMargen / 100);
  const ganancia = precioSugerido - costoTotal;
  const precioUnitarioSugerido = cantidadItem > 0 ? precioSugerido / cantidadItem : null;

  // Acciones
  const handleApply = () => {
    if (componentes.length === 0 || costoTotal <= 0) {
      toast.error('Agregá al menos un componente con costo para aplicar el precio');
      return;
    }

    for (let i = 0; i < componentes.length; i++) {
      const c = componentes[i];
      if (!c.nombre.trim()) {
        toast.error(`El componente #${i + 1} debe tener un nombre`);
        return;
      }
      if (Number(c.cantidad) < 0) {
        toast.error(`La cantidad del componente #${i + 1} no puede ser negativa`);
        return;
      }
      if (Number(c.costo_unitario) < 0) {
        toast.error(`El costo del componente #${i + 1} no puede ser negativo`);
        return;
      }
    }

    const cleanCosteo: Costeo = {
      margen_pct: numMargen,
      componentes: componentes.map((c) => ({
        tipo: c.tipo,
        ref_id: c.ref_id || null,
        nombre: c.nombre.trim(),
        unidad: c.unidad?.trim() || null,
        cantidad: Number(c.cantidad) || 0,
        en_unidad_compra: c.tipo === 'insumo' ? Boolean(c.en_unidad_compra) : undefined,
        costo_unitario: Number(c.costo_unitario) || 0,
      })),
    };

    const precioRedondeado = Math.round(precioSugerido * 100) / 100;
    onApply(cleanCosteo, precioRedondeado);
    onClose();
  };

  const handleClearDesglose = () => {
    onApply(null, null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300">
      <div className="bg-white w-full max-w-4xl max-h-[90vh] rounded-[2.5rem] shadow-2xl border border-white/20 flex flex-col overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-12 duration-500">
        {/* Header */}
        <div className="px-10 py-7 border-b border-outline-variant/10 flex justify-between items-start bg-surface-container-low/30 shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-2xl">calculate</span>
              <h3 className="text-2xl font-headline font-extrabold text-on-surface tracking-tight">
                Calculadora de Costos
              </h3>
            </div>
            <p className="text-sm font-extrabold text-on-surface mt-1">
              {itemLabel || 'Ítem del Presupuesto'}
              {cantidadItem > 0 ? (
                <span className="ml-2 text-xs font-bold text-outline">
                  (Cantidad: {cantidadItem.toLocaleString('es-AR')})
                </span>
              ) : null}
            </p>
            <p className="text-[10px] text-outline font-bold uppercase tracking-wider mt-1 flex items-center gap-1">
              <span className="material-symbols-outlined text-xs">visibility_off</span>
              Este desglose es solo interno: el cliente nunca lo ve.
            </p>
          </div>
          <button
            onClick={onClose}
            title="Cerrar"
            className="p-2 hover:bg-error/10 text-on-surface-variant hover:text-error rounded-full transition-all active:scale-90"
          >
            <span className="material-symbols-outlined text-2xl">close</span>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto no-scrollbar p-8 sm:p-10 space-y-6">
          {/* Botones rápidos para agregar componentes */}
          <div className="space-y-2">
            <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">
              Agregar Componentes al Costeo
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <button
                type="button"
                onClick={() => handleAddComponente('insumo')}
                className="p-3 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-2xl flex items-center justify-center gap-2 text-xs font-extrabold transition-all active:scale-95 shadow-sm"
              >
                <span className="material-symbols-outlined text-base">inventory_2</span>
                + Insumo
              </button>

              <button
                type="button"
                onClick={() => handleAddComponente('servicio')}
                className="p-3 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 rounded-2xl flex items-center justify-center gap-2 text-xs font-extrabold transition-all active:scale-95 shadow-sm"
              >
                <span className="material-symbols-outlined text-base">handyman</span>
                + Servicio propio
              </button>

              <button
                type="button"
                onClick={() => handleAddComponente('tercerizado')}
                className="p-3 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-2xl flex items-center justify-center gap-2 text-xs font-extrabold transition-all active:scale-95 shadow-sm"
              >
                <span className="material-symbols-outlined text-base">local_shipping</span>
                + Tercerizado
              </button>

              <button
                type="button"
                onClick={() => handleAddComponente('otro')}
                className="p-3 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 rounded-2xl flex items-center justify-center gap-2 text-xs font-extrabold transition-all active:scale-95 shadow-sm"
              >
                <span className="material-symbols-outlined text-base">more_horiz</span>
                + Otro costo
              </button>
            </div>
          </div>

          {/* Lista de Filas de Componentes */}
          <div className="space-y-3">
            {loadingLookups ? (
              <div className="py-12 flex flex-col items-center justify-center space-y-2 text-primary/40">
                <div className="w-8 h-8 border-4 border-primary/10 border-t-primary rounded-full animate-spin"></div>
                <p className="text-[10px] font-black uppercase tracking-widest">Cargando catálogo...</p>
              </div>
            ) : componentes.length === 0 ? (
              <div className="p-8 text-center bg-surface-container-low/40 rounded-3xl border border-dashed border-outline-variant/30 space-y-2">
                <span className="material-symbols-outlined text-3xl text-outline/60">post_add</span>
                <p className="text-xs font-bold text-on-surface-variant">
                  No hay componentes en el costeo de esta línea.
                </p>
                <p className="text-[10px] text-outline">
                  Tocá uno de los botones de arriba para sumar papel, tintas, horas de taller, troquelados o fletes.
                </p>
              </div>
            ) : (
              componentes.map((comp, index) => {
                const cantNum = Number(comp.cantidad) || 0;
                const costoNum = Number(comp.costo_unitario) || 0;
                const subtotal = cantNum * costoNum;
                const ins = insumos.find((x) => x.id === comp.ref_id);
                const hasUnidadCompra = Boolean(ins?.unidad_compra_nombre);
                const factor = Number(ins?.factor_compra) || 1;

                return (
                  <div
                    key={comp.rowId}
                    className="p-4 bg-surface-container-low/40 rounded-2xl border border-outline-variant/10 space-y-2 transition-all hover:border-primary/20"
                  >
                    <div className="flex items-center justify-between gap-2 pb-1 border-b border-outline-variant/5">
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2 py-0.5 text-[9px] font-black uppercase rounded-md tracking-wider ${
                            comp.tipo === 'insumo'
                              ? 'bg-emerald-100 text-emerald-800'
                              : comp.tipo === 'servicio'
                              ? 'bg-indigo-100 text-indigo-800'
                              : comp.tipo === 'tercerizado'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-slate-200 text-slate-800'
                          }`}
                        >
                          {comp.tipo === 'insumo'
                            ? 'Insumo'
                            : comp.tipo === 'servicio'
                            ? 'Servicio taller'
                            : comp.tipo === 'tercerizado'
                            ? 'Tercerizado'
                            : 'Otro'}
                        </span>
                        <span className="text-[10px] font-bold text-outline">#{index + 1}</span>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleRemoveComponente(comp.rowId)}
                        title="Quitar componente"
                        className="p-1 text-on-surface-variant hover:text-error rounded-lg transition-all"
                      >
                        <span className="material-symbols-outlined text-lg">delete</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-start pt-1">
                      {/* Selección del Ítem según el tipo */}
                      {comp.tipo === 'insumo' ? (
                        <div className="md:col-span-5 relative space-y-1">
                          <label className="text-[9px] font-black text-on-surface-variant uppercase tracking-widest ml-1">
                            Insumo
                          </label>
                          <input
                            type="text"
                            value={comp.insumoSearch}
                            onChange={(e) => {
                              updateComponenteField(comp.rowId, 'insumoSearch', e.target.value);
                              updateComponenteField(comp.rowId, 'isDropdownOpen', true);
                              if (comp.ref_id) updateComponenteField(comp.rowId, 'ref_id', null);
                            }}
                            onFocus={() => updateComponenteField(comp.rowId, 'isDropdownOpen', true)}
                            onBlur={() =>
                              setTimeout(
                                () => updateComponenteField(comp.rowId, 'isDropdownOpen', false),
                                200
                              )
                            }
                            placeholder="Buscar insumo..."
                            className="w-full bg-white border border-outline-variant/10 rounded-xl py-2 px-3 text-xs font-bold text-on-surface focus:ring-2 focus:ring-primary/20 shadow-sm"
                          />

                          {comp.isDropdownOpen && (
                            <div className="absolute z-30 top-full left-0 right-0 mt-1 bg-white rounded-xl shadow-2xl border border-outline-variant/10 max-h-52 overflow-y-auto">
                              {insumos
                                .filter((i) => {
                                  const q = (comp.insumoSearch || '').toLowerCase();
                                  return (
                                    i.nombre.toLowerCase().includes(q) ||
                                    (i.codigo && i.codigo.toLowerCase().includes(q))
                                  );
                                })
                                .map((i) => (
                                  <button
                                    type="button"
                                    key={i.id}
                                    onMouseDown={(e) => {
                                      e.preventDefault();
                                      handleSelectInsumo(comp.rowId, i);
                                    }}
                                    className="w-full text-left px-3 py-2 text-xs font-bold hover:bg-primary/5 transition-colors border-b border-outline-variant/5 flex justify-between items-center"
                                  >
                                    <span>{i.nombre}</span>
                                    <span className="text-[10px] text-outline">
                                      Stock: {Number(i.stock).toLocaleString('es-AR')} {i.unidad_stock_nombre}
                                    </span>
                                  </button>
                                ))}
                            </div>
                          )}
                        </div>
                      ) : comp.tipo === 'servicio' || comp.tipo === 'tercerizado' ? (
                        <div className="md:col-span-5 space-y-1">
                          <label className="text-[9px] font-black text-on-surface-variant uppercase tracking-widest ml-1">
                            {comp.tipo === 'servicio' ? 'Servicio de Taller' : 'Servicio Tercerizado'}
                          </label>
                          <select
                            value={comp.ref_id || ''}
                            onChange={(e) => handleSelectServicio(comp.rowId, e.target.value)}
                            className="w-full bg-white border border-outline-variant/10 rounded-xl py-2 px-3 text-xs font-bold text-on-surface focus:ring-2 focus:ring-primary/20 appearance-none cursor-pointer shadow-sm"
                          >
                            <option value="">Seleccionar servicio...</option>
                              {servicios
                                .filter((s) => (comp.tipo === 'servicio' ? s.tipo === 'propio' : s.tipo === 'tercerizado'))
                                .map((s) => {
                                  const uNombre = Array.isArray(s.t_conf_unidades_medida)
                                    ? s.t_conf_unidades_medida[0]?.nombre
                                    : s.t_conf_unidades_medida?.nombre;
                                  return (
                                    <option key={s.id} value={s.id}>
                                      {s.nombre} {uNombre ? `(${uNombre})` : ''} - ${Number(s.costo_unitario).toLocaleString('es-AR')}
                                    </option>
                                  );
                                })}
                          </select>
                        </div>
                      ) : (
                        <div className="md:col-span-5 space-y-1">
                          <label className="text-[9px] font-black text-on-surface-variant uppercase tracking-widest ml-1">
                            Descripción del Costo
                          </label>
                          <input
                            type="text"
                            value={comp.nombre}
                            onChange={(e) => updateComponenteField(comp.rowId, 'nombre', e.target.value)}
                            placeholder="Ej: Flete, Embalaje especial..."
                            className="w-full bg-white border border-outline-variant/10 rounded-xl py-2 px-3 text-xs font-bold text-on-surface focus:ring-2 focus:ring-primary/20 shadow-sm"
                          />
                        </div>
                      )}

                      {/* Cantidad */}
                      <div className="md:col-span-2 space-y-1">
                        <label className="text-[9px] font-black text-on-surface-variant uppercase tracking-widest ml-1">
                          Cantidad
                        </label>
                        <input
                          type="number"
                          step="any"
                          min="0"
                          value={comp.cantidad}
                          onChange={(e) => updateComponenteField(comp.rowId, 'cantidad', e.target.value)}
                          placeholder="1"
                          className="w-full bg-white border border-outline-variant/10 rounded-xl py-2 px-3 text-xs font-black text-primary focus:ring-2 focus:ring-primary/20 shadow-sm"
                        />
                      </div>

                      {/* Unidad (Selector si es insumo con unidad de compra, o input si es otro, o label) */}
                      <div className="md:col-span-2 space-y-1">
                        <label className="text-[9px] font-black text-on-surface-variant uppercase tracking-widest ml-1">
                          Unidad
                        </label>
                        {comp.tipo === 'insumo' && ins && hasUnidadCompra ? (
                          <div className="flex flex-col gap-1 text-[10px] pt-1">
                            <label className="flex items-center gap-1.5 cursor-pointer font-bold text-on-surface select-none">
                              <input
                                type="radio"
                                name={`unit_${comp.rowId}`}
                                checked={comp.en_unidad_compra}
                                onChange={() => handleInsumoUnitToggle(comp.rowId, true)}
                                className="text-primary focus:ring-primary/20 text-xs"
                              />
                              {ins.unidad_compra_nombre}
                            </label>
                            <label className="flex items-center gap-1.5 cursor-pointer font-bold text-on-surface select-none">
                              <input
                                type="radio"
                                name={`unit_${comp.rowId}`}
                                checked={!comp.en_unidad_compra}
                                onChange={() => handleInsumoUnitToggle(comp.rowId, false)}
                                className="text-primary focus:ring-primary/20 text-xs"
                              />
                              {ins.unidad_stock_nombre}
                            </label>
                          </div>
                        ) : comp.tipo === 'otro' ? (
                          <input
                            type="text"
                            value={comp.unidad || ''}
                            onChange={(e) => updateComponenteField(comp.rowId, 'unidad', e.target.value)}
                            placeholder="Ej: Viaje"
                            className="w-full bg-white border border-outline-variant/10 rounded-xl py-2 px-3 text-xs font-bold text-on-surface focus:ring-2 focus:ring-primary/20 shadow-sm"
                          />
                        ) : (
                          <p className="text-xs font-bold text-on-surface pt-2">
                            {comp.unidad || 'Unidad'}
                          </p>
                        )}
                      </div>

                      {/* Costo Unitario */}
                      <div className="md:col-span-3 space-y-1">
                        <label className="text-[9px] font-black text-on-surface-variant uppercase tracking-widest ml-1">
                          Costo Unit. ($)
                        </label>
                        <input
                          type="number"
                          step="any"
                          min="0"
                          value={comp.costo_unitario}
                          onChange={(e) => updateComponenteField(comp.rowId, 'costo_unitario', e.target.value)}
                          placeholder="0.00"
                          className="w-full bg-white border border-outline-variant/10 rounded-xl py-2 px-3 text-xs font-bold text-on-surface focus:ring-2 focus:ring-primary/20 shadow-sm"
                        />
                      </div>
                    </div>

                    {/* Subtotal del Componente */}
                    <div className="flex items-center justify-between pt-1 text-xs">
                      {comp.tipo === 'insumo' && ins && comp.en_unidad_compra && factor !== 1 && cantNum > 0 ? (
                        <span className="text-[10px] font-bold text-outline">
                          = {(cantNum * factor).toLocaleString('es-AR', { maximumFractionDigits: 3 })}{' '}
                          {ins.unidad_stock_nombre} de stock
                        </span>
                      ) : (
                        <span></span>
                      )}
                      <span className="font-bold text-on-surface">
                        Subtotal:{' '}
                        <strong className="font-black text-primary">
                          ${subtotal.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                        </strong>
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <hr className="border-outline-variant/10" />

          {/* Sección: Margen y Resumen Financiero en Vivo */}
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-xl">trending_up</span>
                <h4 className="text-sm font-black uppercase tracking-[0.2em] text-primary">
                  Margen y Precio Sugerido
                </h4>
              </div>

              {/* Input Margen */}
              <div className="flex items-center gap-3">
                <label className="text-xs font-black text-on-surface uppercase tracking-wider">
                  Margen de Ganancia:
                </label>
                <div className="relative flex items-center">
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={margenPct}
                    onChange={(e) => setMargenPct(e.target.value)}
                    className="w-24 bg-surface-container-low border-none rounded-xl py-2 pl-3 pr-7 text-sm font-black text-primary focus:ring-2 focus:ring-primary/20 shadow-inner"
                  />
                  <span className="absolute right-3 text-xs font-black text-outline pointer-events-none">%</span>
                </div>
              </div>
            </div>

            {/* Tarjetas de Resumen en Vivo */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-surface-container-low/60 p-4 rounded-2xl border border-outline-variant/10">
                <p className="text-[9px] font-black text-on-surface-variant uppercase tracking-widest">
                  Costo Total
                </p>
                <p className="text-lg font-headline font-extrabold text-on-surface mt-0.5">
                  ${costoTotal.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                </p>
              </div>

              <div className="bg-emerald-50/60 p-4 rounded-2xl border border-emerald-100">
                <p className="text-[9px] font-black text-emerald-800 uppercase tracking-widest">
                  Ganancia Estimada
                </p>
                <p className="text-lg font-headline font-extrabold text-emerald-700 mt-0.5">
                  +${ganancia.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                </p>
              </div>

              <div className="bg-slate-900 text-white p-4 rounded-2xl col-span-2 flex flex-col justify-between">
                <div>
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                    Precio Total Sugerido (+{numMargen}%)
                  </p>
                  <p className="text-2xl font-headline font-extrabold text-white mt-0.5">
                    ${precioSugerido.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                  </p>
                </div>
                {precioUnitarioSugerido !== null && (
                  <p className="text-[10px] font-bold text-slate-300 mt-1">
                    Precio unitario sugerido: ${precioUnitarioSugerido.toLocaleString('es-AR', { minimumFractionDigits: 2 })} / u.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-10 py-6 bg-surface-container-low/50 border-t border-outline-variant/10 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div>
            {initialCosteo && (
              <button
                type="button"
                onClick={handleClearDesglose}
                className="px-4 py-3 text-error hover:bg-error/10 font-bold rounded-2xl text-xs uppercase tracking-widest transition-all active:scale-95"
              >
                Quitar Desglose
              </button>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-3.5 bg-white text-on-surface-variant font-bold rounded-2xl hover:bg-slate-100 transition-all border border-outline-variant/20 active:scale-95 text-xs uppercase tracking-widest"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={componentes.length === 0 || costoTotal <= 0}
              onClick={handleApply}
              className="px-8 py-3.5 bg-primary text-white font-bold rounded-2xl shadow-xl shadow-primary/20 hover:brightness-110 active:scale-95 transition-all flex items-center gap-2 text-xs uppercase tracking-widest disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-lg">check</span>
              Usar este precio (${precioSugerido.toLocaleString('es-AR', { minimumFractionDigits: 2 })})
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CostCalculatorModal;
