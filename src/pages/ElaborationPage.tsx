import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { toast } from 'react-hot-toast';
import { useAuthStore } from '../store/authStore';

interface InsumoOption {
  id: string;
  nombre: string;
  codigo?: string | null;
  unidad_stock_nombre: string;
  stock: number;
}

interface ProductoOption {
  id: string;
  nombre: string;
  unidad_medida: string;
  stock: number;
}

interface ConsumoLine {
  rowId: string;
  tipo: 'insumo' | 'producto';
  refId: string;
  nombre: string;
  unidad: string;
  cantidad: number | string;
}

interface HistorialRow {
  id: string;
  elaboracion_id: string;
  tipo_registro: 'insumo' | 'resultado';
  item_nombre: string;
  cantidad: number;
  stock_anterior: number;
  stock_nuevo: number;
  created_at: string;
  motivo: string | null;
}

const ElaborationPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const { user } = useAuthStore();

  const [insumos, setInsumos] = useState<InsumoOption[]>([]);
  const [productos, setProductos] = useState<ProductoOption[]>([]);

  // Panel izquierdo: qué se consume (insumo o producto, cualquier combinación)
  const [consumoSearch, setConsumoSearch] = useState('');
  const [isConsumoDropdownOpen, setIsConsumoDropdownOpen] = useState(false);
  const [consumos, setConsumos] = useState<ConsumoLine[]>([]);

  // Panel derecho: producto resultante
  const [productoSearch, setProductoSearch] = useState('');
  const [isProductoDropdownOpen, setIsProductoDropdownOpen] = useState(false);
  const [productoResultante, setProductoResultante] = useState<ProductoOption | null>(null);
  const [cantidadProducida, setCantidadProducida] = useState('');
  const [motivo, setMotivo] = useState('');
  const [confirmando, setConfirmando] = useState(false);

  // Historial
  const [historial, setHistorial] = useState<HistorialRow[]>([]);
  const [loadingHistorial, setLoadingHistorial] = useState(true);

  const fetchCatalogos = useCallback(async () => {
    try {
      const [insRes, prodRes] = await Promise.all([
        supabase.from('v_insumos_stock').select('id, nombre, codigo, unidad_stock_nombre, stock').eq('activo', true).order('nombre', { ascending: true }),
        supabase.from('v_productos_stock').select('id, nombre, unidad_medida, stock').eq('activo', true).order('nombre', { ascending: true }),
      ]);
      if (insRes.error) throw insRes.error;
      if (prodRes.error) throw prodRes.error;
      setInsumos(insRes.data || []);
      setProductos(prodRes.data || []);
    } catch (err: any) {
      toast.error('Error al cargar insumos/productos: ' + err.message);
    }
  }, []);

  const fetchHistorial = useCallback(async () => {
    setLoadingHistorial(true);
    try {
      const { data, error } = await supabase
        .from('v_historial_elaboraciones')
        .select('id, elaboracion_id, tipo_registro, item_nombre, cantidad, stock_anterior, stock_nuevo, created_at, motivo')
        .order('created_at', { ascending: false })
        .limit(150);
      if (error) throw error;
      setHistorial(data || []);
    } catch (err: any) {
      toast.error('Error al cargar el historial: ' + err.message);
    } finally {
      setLoadingHistorial(false);
    }
  }, []);

  useEffect(() => {
    fetchCatalogos();
    fetchHistorial();
  }, [fetchCatalogos, fetchHistorial]);

  // Si se llega desde Productos ("Elaborar" en un producto puntual), precargar el resultado
  useEffect(() => {
    const presetId = searchParams.get('producto');
    if (presetId && productos.length > 0 && !productoResultante) {
      const p = productos.find((x) => x.id === presetId);
      if (p) {
        setProductoResultante(p);
        setProductoSearch(p.nombre);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, productos]);

  const yaElegidos = new Set(consumos.map((c) => c.refId));
  const q = consumoSearch.trim().toLowerCase();
  const insumoOptions = insumos.filter(
    (i) => !yaElegidos.has(i.id) && (i.nombre.toLowerCase().includes(q) || (i.codigo && i.codigo.toLowerCase().includes(q)))
  );
  const productoOptions = productos.filter(
    (p) => !yaElegidos.has(p.id) && (!productoResultante || p.id !== productoResultante.id) && p.nombre.toLowerCase().includes(q)
  );

  const handleAddInsumo = (i: InsumoOption) => {
    setConsumos((prev) => [
      ...prev,
      { rowId: `c-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, tipo: 'insumo', refId: i.id, nombre: i.nombre, unidad: i.unidad_stock_nombre, cantidad: '' },
    ]);
    setConsumoSearch('');
  };

  const handleAddProducto = (p: ProductoOption) => {
    setConsumos((prev) => [
      ...prev,
      { rowId: `c-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, tipo: 'producto', refId: p.id, nombre: p.nombre, unidad: p.unidad_medida, cantidad: '' },
    ]);
    setConsumoSearch('');
  };

  const handleRemoveConsumo = (rowId: string) => setConsumos((prev) => prev.filter((c) => c.rowId !== rowId));
  const handleUpdateConsumoCantidad = (rowId: string, value: string) =>
    setConsumos((prev) => prev.map((c) => (c.rowId === rowId ? { ...c, cantidad: value } : c)));

  const handleSelectProductoResultante = (p: ProductoOption) => {
    setProductoResultante(p);
    setProductoSearch(p.nombre);
    setIsProductoDropdownOpen(false);
    // No se puede consumir a sí mismo en la misma elaboración
    setConsumos((prev) => prev.filter((c) => !(c.tipo === 'producto' && c.refId === p.id)));
  };

  const puedeConfirmar =
    consumos.length > 0 &&
    consumos.every((c) => Number(c.cantidad) > 0) &&
    !!productoResultante &&
    Number(cantidadProducida) > 0;

  const handleConfirmar = async () => {
    if (!productoResultante) {
      toast.error('Elegí el producto resultante');
      return;
    }
    const cantidad = Number(cantidadProducida);
    if (!cantidad || cantidad <= 0) {
      toast.error('Ingresá la cantidad producida');
      return;
    }
    if (consumos.length === 0) {
      toast.error('Agregá al menos un insumo o producto a consumir');
      return;
    }
    for (const c of consumos) {
      if (!Number(c.cantidad) || Number(c.cantidad) <= 0) {
        toast.error(`Ingresá una cantidad válida para "${c.nombre}"`);
        return;
      }
    }

    setConfirmando(true);
    try {
      const { data, error } = await supabase.rpc('elaborar_producto', {
        p_producto_id: productoResultante.id,
        p_cantidad: cantidad,
        p_consumos: consumos.map((c) => ({ tipo: c.tipo, ref_id: c.refId, cantidad: Number(c.cantidad) })),
        p_motivo: motivo.trim() || null,
        p_usuario_id: user?.id || null,
      });
      if (error) throw error;

      const res = data && data[0];
      const negIns = Number(res?.insumos_en_negativo || 0);
      const negProd = Number(res?.productos_en_negativo || 0);
      let msg = `Elaboración confirmada. Stock nuevo de "${productoResultante.nombre}": ${Number(res?.stock_nuevo ?? 0).toLocaleString('es-AR')}.`;
      if (negIns > 0) msg += ` ${negIns} insumo(s) quedaron con stock negativo.`;
      if (negProd > 0) msg += ` ${negProd} producto(s) consumido(s) quedaron con stock negativo.`;
      toast.success(msg);

      setConsumos([]);
      setProductoResultante(null);
      setProductoSearch('');
      setCantidadProducida('');
      setMotivo('');
      fetchCatalogos();
      fetchHistorial();
    } catch (err: any) {
      toast.error(err.message || 'Error al confirmar la elaboración');
    } finally {
      setConfirmando(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in duration-700">
      <header>
        <nav className="flex items-center gap-2 text-xs font-medium text-on-surface-variant mb-2">
          <span>Grafiko</span>
          <span className="material-symbols-outlined text-[14px]">chevron_right</span>
          <span className="text-primary">Elaboración</span>
        </nav>
        <h1 className="text-3xl font-headline font-extrabold text-on-background tracking-tight">Elaboración de Productos</h1>
        <p className="text-sm text-on-surface-variant mt-1">
          Elegí qué insumos y/o productos se consumen y qué producto sale, con la cantidad exacta de cada uno.
        </p>
      </header>

      {/* Paneles: Consumo / Resultado */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Insumos / Productos a consumir */}
        <section className="bg-white rounded-[2rem] shadow-sm border border-outline-variant/10 p-6 space-y-4">
          <div className="flex items-center gap-2 text-amber-700">
            <span className="material-symbols-outlined">shopping_bag</span>
            <h2 className="text-sm font-black uppercase tracking-widest">Insumos / Productos a Consumir</h2>
          </div>
          <p className="text-[11px] text-on-surface-variant font-medium">
            Seleccioná lo que se va a gastar en esta elaboración (insumos, productos ya elaborados, o ambos).
          </p>

          <div className="relative">
            <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant text-lg">search</span>
            <input
              type="text"
              value={consumoSearch}
              onChange={(e) => {
                setConsumoSearch(e.target.value);
                setIsConsumoDropdownOpen(true);
              }}
              onFocus={() => setIsConsumoDropdownOpen(true)}
              onBlur={() => setTimeout(() => setIsConsumoDropdownOpen(false), 200)}
              placeholder="Buscar insumo o producto por nombre..."
              className="w-full bg-surface-container-low border-none rounded-2xl py-3 pl-11 pr-4 text-sm font-bold focus:ring-2 focus:ring-primary/20 shadow-inner"
            />

            {isConsumoDropdownOpen && (
              <div className="absolute z-30 top-full left-0 right-0 mt-1 bg-white rounded-2xl shadow-2xl border border-outline-variant/10 max-h-64 overflow-y-auto">
                {insumoOptions.length === 0 && productoOptions.length === 0 && (
                  <p className="px-4 py-3 text-xs text-outline/50 italic">No se encontraron insumos ni productos</p>
                )}
                {insumoOptions.map((i) => (
                  <button
                    type="button"
                    key={`ins-${i.id}`}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleAddInsumo(i);
                    }}
                    className="w-full text-left px-4 py-2.5 text-xs font-bold hover:bg-emerald-50 transition-colors border-b border-outline-variant/5 flex items-center gap-2"
                  >
                    <span className="material-symbols-outlined text-emerald-600 text-base shrink-0">inventory_2</span>
                    <span className="flex-1 text-on-surface">{i.nombre}</span>
                    <span className="text-[10px] text-outline font-medium">
                      Stock: {Number(i.stock).toLocaleString('es-AR', { maximumFractionDigits: 2 })} {i.unidad_stock_nombre}
                    </span>
                  </button>
                ))}
                {productoOptions.map((p) => (
                  <button
                    type="button"
                    key={`prod-${p.id}`}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleAddProducto(p);
                    }}
                    className="w-full text-left px-4 py-2.5 text-xs font-bold hover:bg-indigo-50 transition-colors border-b border-outline-variant/5 flex items-center gap-2"
                  >
                    <span className="material-symbols-outlined text-indigo-600 text-base shrink-0">inventory</span>
                    <span className="flex-1 text-on-surface">{p.nombre}</span>
                    <span className="text-[10px] text-outline font-medium">
                      Stock: {Number(p.stock).toLocaleString('es-AR', { maximumFractionDigits: 2 })} {p.unidad_medida}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {consumos.length === 0 ? (
            <div className="p-8 text-center bg-surface-container-low/40 rounded-3xl border border-dashed border-outline-variant/30">
              <span className="material-symbols-outlined text-3xl text-outline/60">shopping_cart</span>
              <p className="text-xs font-bold text-on-surface-variant mt-2">No has agregado insumos</p>
            </div>
          ) : (
            <div className="space-y-2">
              {consumos.map((c) => (
                <div key={c.rowId} className="flex items-center gap-2 p-2.5 bg-surface-container-low/40 rounded-xl border border-outline-variant/10">
                  <span className={`material-symbols-outlined text-base shrink-0 ${c.tipo === 'insumo' ? 'text-emerald-600' : 'text-indigo-600'}`}>
                    {c.tipo === 'insumo' ? 'inventory_2' : 'inventory'}
                  </span>
                  <span className="flex-1 min-w-0 text-xs font-bold text-on-surface truncate">{c.nombre}</span>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    placeholder="Cant."
                    value={c.cantidad}
                    onChange={(e) => handleUpdateConsumoCantidad(c.rowId, e.target.value)}
                    className="w-20 shrink-0 bg-white border border-outline-variant/20 rounded-lg py-1.5 px-2 text-xs font-black text-primary text-center focus:ring-2 focus:ring-primary/20"
                  />
                  <span className="w-14 shrink-0 text-[10px] font-bold text-outline truncate">{c.unidad}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveConsumo(c.rowId)}
                    className="p-1 shrink-0 text-on-surface-variant hover:text-error rounded-lg transition-all"
                  >
                    <span className="material-symbols-outlined text-base">delete</span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Producto Resultante */}
        <section className="bg-emerald-50/40 rounded-[2rem] shadow-sm border border-emerald-100 p-6 space-y-4">
          <div className="flex items-center gap-2 text-emerald-700">
            <span className="material-symbols-outlined">check_circle</span>
            <h2 className="text-sm font-black uppercase tracking-widest">Producto Resultante</h2>
          </div>
          <p className="text-[11px] text-on-surface-variant font-medium">Seleccioná el producto terminado que se obtiene y en qué cantidad.</p>

          <div className="relative">
            <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant text-lg">search</span>
            <input
              type="text"
              value={productoSearch}
              onChange={(e) => {
                setProductoSearch(e.target.value);
                setIsProductoDropdownOpen(true);
                if (productoResultante) setProductoResultante(null);
              }}
              onFocus={() => setIsProductoDropdownOpen(true)}
              onBlur={() => setTimeout(() => setIsProductoDropdownOpen(false), 200)}
              placeholder="Buscar producto de salida..."
              className="w-full bg-white border-none rounded-2xl py-3 pl-11 pr-4 text-sm font-bold focus:ring-2 focus:ring-emerald-300 shadow-inner"
            />

            {isProductoDropdownOpen && (
              <div className="absolute z-30 top-full left-0 right-0 mt-1 bg-white rounded-2xl shadow-2xl border border-outline-variant/10 max-h-64 overflow-y-auto">
                {productos
                  .filter((p) => p.nombre.toLowerCase().includes(productoSearch.trim().toLowerCase()))
                  .map((p) => (
                    <button
                      type="button"
                      key={p.id}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        handleSelectProductoResultante(p);
                      }}
                      className="w-full text-left px-4 py-2.5 text-xs font-bold hover:bg-emerald-50 transition-colors border-b border-outline-variant/5 flex justify-between items-center"
                    >
                      <span className="text-on-surface">{p.nombre}</span>
                      <span className="text-[10px] text-outline font-medium">
                        Stock: {Number(p.stock).toLocaleString('es-AR', { maximumFractionDigits: 2 })} {p.unidad_medida}
                      </span>
                    </button>
                  ))}
              </div>
            )}
          </div>

          {productoResultante && (
            <>
              <div className="p-4 bg-white rounded-2xl border border-emerald-100 flex items-center justify-between">
                <div>
                  <p className="text-sm font-headline font-extrabold text-on-surface">{productoResultante.nombre}</p>
                  <p className="text-[10px] text-outline font-bold uppercase tracking-wider">
                    Stock actual: {Number(productoResultante.stock).toLocaleString('es-AR', { maximumFractionDigits: 2 })} {productoResultante.unidad_medida}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setProductoResultante(null);
                    setProductoSearch('');
                  }}
                  className="p-1.5 text-on-surface-variant hover:text-error rounded-full transition-all"
                >
                  <span className="material-symbols-outlined text-lg">close</span>
                </button>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant px-1">
                  Cantidad producida <span className="text-error">*</span>
                </label>
                <input
                  type="number"
                  step="any"
                  min="0.0001"
                  value={cantidadProducida}
                  onChange={(e) => setCantidadProducida(e.target.value)}
                  placeholder="0"
                  className="w-full bg-white border border-emerald-200 rounded-2xl py-3 px-4 text-sm font-black text-emerald-700 focus:ring-2 focus:ring-emerald-300 shadow-inner"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant px-1">Motivo (opcional)</label>
                <input
                  type="text"
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Ej: tanda para stock de octubre"
                  className="w-full bg-white border border-outline-variant/20 rounded-2xl py-3 px-4 text-sm font-bold focus:ring-2 focus:ring-primary/20 shadow-inner"
                />
              </div>
            </>
          )}

          <button
            type="button"
            disabled={!puedeConfirmar || confirmando}
            onClick={handleConfirmar}
            className="w-full py-3.5 bg-emerald-600 text-white font-bold rounded-2xl shadow-lg shadow-emerald-600/20 hover:brightness-110 active:scale-95 disabled:opacity-40 transition-all flex items-center justify-center gap-2 text-xs uppercase tracking-widest"
          >
            <span className="material-symbols-outlined text-lg">bolt</span>
            {confirmando ? 'Confirmando...' : 'Confirmar Elaboración'}
          </button>
        </section>
      </div>

      {/* Historial */}
      <section className="bg-white rounded-[2.5rem] shadow-sm border border-outline-variant/10 overflow-hidden">
        <div className="px-6 py-5 border-b border-outline-variant/10 flex items-center justify-between">
          <div className="flex items-center gap-2 text-primary">
            <span className="material-symbols-outlined">history</span>
            <h2 className="text-sm font-black uppercase tracking-widest">Historial de Elaboración</h2>
          </div>
          <span className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Últimos movimientos</span>
        </div>
        <div className="overflow-x-auto">
          {loadingHistorial ? (
            <div className="py-12 flex justify-center">
              <div className="w-8 h-8 border-4 border-primary/10 border-t-primary rounded-full animate-spin"></div>
            </div>
          ) : historial.length === 0 ? (
            <p className="text-center text-xs text-outline italic py-12">Todavía no hay elaboraciones registradas.</p>
          ) : (
            <table className="w-full text-left">
              <thead>
                <tr className="bg-surface-container-low/30">
                  <th className="px-6 py-3 text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Motivo / Producto</th>
                  <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Tipo</th>
                  <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-on-surface-variant text-right">Cantidad</th>
                  <th className="px-6 py-3 text-[10px] font-black uppercase tracking-widest text-on-surface-variant text-right">Stock Nuevo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/5">
                {historial.map((h) => {
                  const esResultado = h.tipo_registro === 'resultado';
                  return (
                    <tr key={h.id} className="hover:bg-surface-container-low/30 transition-colors">
                      <td className="px-6 py-3.5">
                        <p className="text-[10px] font-bold text-outline">
                          Elaboración [Ref: {h.elaboracion_id.slice(0, 8)}] -{' '}
                          {new Date(h.created_at).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </p>
                        <p className="text-sm font-bold text-on-surface">{h.item_nombre}</p>
                      </td>
                      <td className="px-4 py-3.5">
                        <span
                          className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider ${
                            esResultado ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                          }`}
                        >
                          {esResultado ? 'Resultado' : 'Insumo'}
                        </span>
                      </td>
                      <td className={`px-4 py-3.5 text-right font-black text-sm ${esResultado ? 'text-emerald-600' : 'text-error'}`}>
                        {esResultado ? '+' : '-'}
                        {Number(h.cantidad).toLocaleString('es-AR', { maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-6 py-3.5 text-right font-bold text-sm text-on-surface">
                        {Number(h.stock_nuevo).toLocaleString('es-AR', { maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
};

export default ElaborationPage;
