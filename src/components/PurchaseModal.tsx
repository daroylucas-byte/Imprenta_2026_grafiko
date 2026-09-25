import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { todayAR } from '../utils/dates';
import { toast } from 'react-hot-toast';
import { useAuthStore } from '../store/authStore';
import SupplierModal from './SupplierModal';

interface PurchaseModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

interface SupplierOption {
  id: string;
  nombre: string;
  condicion_pago?: 'contado' | 'cuenta_corriente';
  saldo_pendiente?: number;
  activo?: boolean;
}

interface InsumoOption {
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

interface TipoGastoOption {
  id: string;
  nombre: string;
}

interface PurchaseItemRow {
  rowId: string;
  insumoId: string;
  insumoSearch: string;
  isDropdownOpen: boolean;
  cantidad: number | string;
  enUnidadCompra: boolean;
  costoUnitario: number | string;
}

const FORMAS_PAGO = ['Efectivo', 'Transferencia', 'Cheque', 'Mercado Pago', 'QR', 'Banco', 'Otro'];

const PurchaseModal: React.FC<PurchaseModalProps> = ({ onClose, onSuccess }) => {
  const [loading, setLoading] = useState(false);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [insumos, setInsumos] = useState<InsumoOption[]>([]);
  const [tiposGasto, setTiposGasto] = useState<TipoGastoOption[]>([]);
  const [efectivoEsperadoCaja, setEfectivoEsperadoCaja] = useState<number | null>(null);
  const { user } = useAuthStore();

  // Modal de alta rápida de proveedor
  const [isNewSupplierOpen, setIsNewSupplierOpen] = useState(false);

  // Proveedor combobox state
  const [supplierSearch, setSupplierSearch] = useState('');
  const [isSupplierDropdownOpen, setIsSupplierDropdownOpen] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<SupplierOption | null>(null);

  // Datos generales de la compra
  const [fecha, setFecha] = useState(todayAR());
  const [nroComprobante, setNroComprobante] = useState('');
  const [observaciones, setObservaciones] = useState('');

  // Ítems
  const [items, setItems] = useState<PurchaseItemRow[]>([
    {
      rowId: 'row-1',
      insumoId: '',
      insumoSearch: '',
      isDropdownOpen: false,
      cantidad: '',
      enUnidadCompra: true,
      costoUnitario: '',
    },
  ]);

  // Pago
  const [condicionPago, setCondicionPago] = useState<'contado' | 'cuenta_corriente'>('contado');
  const [formaPago, setFormaPago] = useState('Efectivo');
  const [descontarCaja, setDescontarCaja] = useState(true);
  const [tipoGastoId, setTipoGastoId] = useState('');

  // Cargar listas iniciales
  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        const [supRes, insRes, tgRes, cajaRes] = await Promise.all([
          supabase
            .from('v_saldo_proveedores')
            .select('id, nombre, condicion_pago, saldo_pendiente, activo')
            .eq('activo', true)
            .order('nombre', { ascending: true }),
          supabase
            .from('v_insumos_stock')
            .select('id, nombre, codigo, unidad_stock_nombre, unidad_compra_nombre, factor_compra, stock, ultimo_costo_compra, activo')
            .eq('activo', true)
            .order('nombre', { ascending: true }),
          supabase
            .from('t_conf_tipos_gasto')
            .select('id, nombre')
            .order('nombre', { ascending: true }),
          supabase
            .from('v_caja_efectivo_actual')
            .select('efectivo_esperado')
            .maybeSingle(),
        ]);

        if (supRes.error) throw supRes.error;
        if (insRes.error) throw insRes.error;

        setSuppliers(supRes.data || []);
        setInsumos(insRes.data || []);
        const tgs = tgRes.data || [];
        setTiposGasto(tgs);

        // Preseleccionar tipo de gasto que se llame "Insumos" si existe
        const defaultTg = tgs.find((t) => t.nombre.trim().toLowerCase() === 'insumos');
        if (defaultTg) {
          setTipoGastoId(defaultTg.id);
        }

        if (cajaRes.data) {
          setEfectivoEsperadoCaja(Number(cajaRes.data.efectivo_esperado || 0));
        }
      } catch (err: any) {
        console.error('Error loading purchase modal lookups:', err);
        toast.error('Error al cargar datos para la compra: ' + err.message);
      }
    };

    fetchInitialData();
  }, []);

  // Al seleccionar un proveedor, configurar su condición de pago por defecto
  const handleSelectSupplier = (sup: SupplierOption) => {
    setSelectedSupplier(sup);
    setSupplierSearch(sup.nombre);
    setIsSupplierDropdownOpen(false);
    if (sup.condicion_pago) {
      setCondicionPago(sup.condicion_pago);
    }
  };

  // Ítems handlers
  const handleAddItem = () => {
    setItems((prev) => [
      ...prev,
      {
        rowId: `row-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        insumoId: '',
        insumoSearch: '',
        isDropdownOpen: false,
        cantidad: '',
        enUnidadCompra: true,
        costoUnitario: '',
      },
    ]);
  };

  const handleRemoveItem = (index: number) => {
    if (items.length <= 1) {
      toast.error('La compra debe tener al menos un ítem');
      return;
    }
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSelectInsumo = (index: number, ins: InsumoOption) => {
    const hasUnidadCompra = Boolean(ins.unidad_compra_nombre);
    const defaultEnCompra = hasUnidadCompra;
    const factor = Number(ins.factor_compra) || 1;
    const ultimoCostoCompra = Number(ins.ultimo_costo_compra) || 0;

    let preCosto = '';
    if (ultimoCostoCompra > 0) {
      if (defaultEnCompra) {
        preCosto = String(ultimoCostoCompra);
      } else {
        preCosto = String(ultimoCostoCompra / factor);
      }
    }

    setItems((prev) =>
      prev.map((item, i) =>
        i === index
          ? {
              ...item,
              insumoId: ins.id,
              insumoSearch: ins.nombre,
              isDropdownOpen: false,
              enUnidadCompra: defaultEnCompra,
              costoUnitario: preCosto,
            }
          : item
      )
    );
  };

  const handleUnitToggle = (index: number, enCompra: boolean) => {
    const item = items[index];
    const ins = insumos.find((x) => x.id === item.insumoId);
    if (!ins) {
      setItems((prev) =>
        prev.map((it, i) => (i === index ? { ...it, enUnidadCompra: enCompra } : it))
      );
      return;
    }

    const factor = Number(ins.factor_compra) || 1;
    const ultimoCostoCompra = Number(ins.ultimo_costo_compra) || 0;

    let nuevoCosto = item.costoUnitario;
    if (ultimoCostoCompra > 0) {
      if (enCompra) {
        nuevoCosto = String(ultimoCostoCompra);
      } else {
        nuevoCosto = String(ultimoCostoCompra / factor);
      }
    }

    setItems((prev) =>
      prev.map((it, i) =>
        i === index ? { ...it, enUnidadCompra: enCompra, costoUnitario: nuevoCosto } : it
      )
    );
  };

  const updateItemField = (index: number, field: keyof PurchaseItemRow, value: any) => {
    setItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [field]: value } : item))
    );
  };

  // Cálculo del total estimado en vivo
  const totalCalculado = items.reduce((acc, it) => {
    const cant = Number(it.cantidad) || 0;
    const costo = Number(it.costoUnitario) || 0;
    return acc + cant * costo;
  }, 0);

  const showEfectivoWarning =
    condicionPago === 'contado' &&
    formaPago === 'Efectivo' &&
    descontarCaja &&
    efectivoEsperadoCaja !== null &&
    totalCalculado > efectivoEsperadoCaja;

  const handleSubmitPurchase = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedSupplier) {
      toast.error('Elegí o registrá un proveedor para la compra');
      return;
    }

    if (!fecha) {
      toast.error('Ingresá una fecha válida');
      return;
    }

    if (items.length === 0) {
      toast.error('Debes agregar al menos un ítem a la compra');
      return;
    }

    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!it.insumoId) {
        toast.error(`El ítem #${i + 1} no tiene un insumo seleccionado`);
        return;
      }
      const cant = Number(it.cantidad);
      if (isNaN(cant) || cant <= 0) {
        toast.error(`Ingresá una cantidad válida mayor a 0 en el ítem #${i + 1}`);
        return;
      }
      const costo = Number(it.costoUnitario);
      if (isNaN(costo) || costo < 0) {
        toast.error(`Ingresá un costo unitario válido en el ítem #${i + 1}`);
        return;
      }
    }

    if (totalCalculado <= 0) {
      toast.error('El total de la compra debe ser mayor a $0');
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('registrar_compra', {
        p_proveedor_id: selectedSupplier.id,
        p_items: items.map((i) => ({
          insumo_id: i.insumoId,
          cantidad: Number(i.cantidad),
          en_unidad_compra: i.enUnidadCompra,
          costo_unitario: Number(i.costoUnitario),
        })),
        p_condicion_pago: condicionPago,
        p_forma_pago: condicionPago === 'contado' ? formaPago : null,
        p_fecha: fecha,
        p_nro_comprobante: nroComprobante.trim() || null,
        p_registrar_en_caja: condicionPago === 'contado' ? descontarCaja : false,
        p_tipo_gasto_id:
          condicionPago === 'contado' && descontarCaja && tipoGastoId ? tipoGastoId : null,
        p_observaciones: observaciones.trim() || null,
        p_usuario_id: user?.id || null,
      });

      if (error) throw error;

      const resultado = data && data[0];
      const totalCompra = Number(resultado?.total_compra ?? totalCalculado);
      const totalStr = totalCompra.toLocaleString('es-AR', { minimumFractionDigits: 2 });
      const saldoProv = Number(resultado?.saldo_proveedor ?? 0);
      const saldoStr = saldoProv.toLocaleString('es-AR', { minimumFractionDigits: 2 });

      if (condicionPago === 'cuenta_corriente') {
        toast.success(`Compra registrada por $${totalStr}. Stock actualizado. Saldo con el proveedor: $${saldoStr}`);
      } else {
        toast.success(`Compra registrada por $${totalStr}. Stock actualizado.`);
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Error registering purchase:', err);
      toast.error(err.message || 'Error al registrar la compra');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-[95] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300">
        <div className="bg-white w-full max-w-4xl max-h-[90vh] rounded-[2.5rem] shadow-2xl border border-white/20 flex flex-col overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-12 duration-500">
          {/* Header */}
          <div className="px-10 py-8 border-b border-outline-variant/10 flex justify-between items-center bg-surface-container-low/30 shrink-0">
            <div>
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-2xl">add_shopping_cart</span>
                <h3 className="text-2xl font-headline font-extrabold text-on-surface tracking-tight">
                  Nueva Compra a Proveedor
                </h3>
              </div>
              <p className="text-xs text-on-surface-variant font-bold uppercase tracking-widest mt-1">
                Ingreso de insumos, actualización de stock y costo de compra
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

          {/* Form Body */}
          <form onSubmit={handleSubmitPurchase} className="flex-1 overflow-y-auto no-scrollbar p-8 sm:p-10 space-y-8">
            {/* Sección: Proveedor y Comprobante */}
            <div className="space-y-6">
              <div className="flex items-center gap-3 text-primary">
                <span className="material-symbols-outlined font-bold">factory</span>
                <h4 className="text-sm font-black uppercase tracking-[0.2em]">Proveedor y Comprobante</h4>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Desplegable Proveedor */}
                <div className="space-y-1 md:col-span-2 relative">
                  <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">
                    Proveedor <span className="text-error">*</span>
                  </label>
                  <input
                    type="text"
                    value={supplierSearch}
                    onChange={(e) => {
                      setSupplierSearch(e.target.value);
                      setIsSupplierDropdownOpen(true);
                      if (selectedSupplier) setSelectedSupplier(null);
                    }}
                    onFocus={() => setIsSupplierDropdownOpen(true)}
                    onBlur={() => setTimeout(() => setIsSupplierDropdownOpen(false), 200)}
                    placeholder="Buscar proveedor por nombre..."
                    className="w-full bg-surface-container-low border-none rounded-2xl py-3 px-4 text-sm font-bold focus:ring-2 focus:ring-primary/20 shadow-inner"
                  />

                  {isSupplierDropdownOpen && (
                    <div className="absolute z-30 top-full left-0 right-0 mt-1 bg-white rounded-2xl shadow-2xl border border-outline-variant/10 max-h-60 overflow-y-auto">
                      {suppliers
                        .filter((s) => s.nombre.toLowerCase().includes(supplierSearch.toLowerCase()))
                        .map((s) => (
                          <button
                            type="button"
                            key={s.id}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              handleSelectSupplier(s);
                            }}
                            className="w-full text-left px-4 py-3 text-sm font-bold hover:bg-primary/5 transition-colors border-b border-outline-variant/5 flex justify-between items-center"
                          >
                            <span>{s.nombre}</span>
                            {Number(s.saldo_pendiente || 0) > 0 ? (
                              <span className="text-[10px] font-black text-error bg-error/5 px-2 py-0.5 rounded">
                                Le debemos ${Number(s.saldo_pendiente).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                              </span>
                            ) : null}
                          </button>
                        ))}

                      {suppliers.filter((s) => s.nombre.toLowerCase().includes(supplierSearch.toLowerCase())).length === 0 && (
                        <p className="px-4 py-3 text-xs text-outline/50 italic">No se encontraron proveedores</p>
                      )}

                      {/* Botón Alta Rápida */}
                      <button
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setIsSupplierDropdownOpen(false);
                          setIsNewSupplierOpen(true);
                        }}
                        className="sticky bottom-0 w-full flex items-center gap-2 text-left px-4 py-3 text-xs font-black text-primary bg-slate-50 border-t border-outline-variant/10 hover:bg-primary hover:text-white transition-all"
                      >
                        <span className="material-symbols-outlined text-base">person_add</span>
                        {supplierSearch.trim()
                          ? `Crear proveedor "${supplierSearch.trim()}"`
                          : 'Crear proveedor nuevo'}
                      </button>
                    </div>
                  )}

                  {/* Info del Proveedor Seleccionado */}
                  {selectedSupplier && (
                    <div className="flex items-center gap-4 text-xs font-bold pt-1 ml-1">
                      <span className="text-on-surface-variant">
                        Condición habitual:{' '}
                        <strong className="text-on-surface">
                          {selectedSupplier.condicion_pago === 'cuenta_corriente'
                            ? 'Cuenta corriente'
                            : 'Contado'}
                        </strong>
                      </span>
                      <span>·</span>
                      {Number(selectedSupplier.saldo_pendiente || 0) > 0 ? (
                        <span className="text-error font-black">
                          Le debemos ${Number(selectedSupplier.saldo_pendiente).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                        </span>
                      ) : Number(selectedSupplier.saldo_pendiente || 0) === 0 ? (
                        <span className="text-emerald-600 font-bold">Sin deuda pendiente</span>
                      ) : (
                        <span className="text-emerald-600 font-bold">
                          Saldo a favor: ${Math.abs(Number(selectedSupplier.saldo_pendiente)).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Fecha */}
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">
                    Fecha de la Compra <span className="text-error">*</span>
                  </label>
                  <input
                    type="date"
                    value={fecha}
                    onChange={(e) => setFecha(e.target.value)}
                    className="w-full bg-surface-container-low border-none rounded-2xl py-3 px-4 text-sm font-bold focus:ring-2 focus:ring-primary/20 shadow-inner"
                  />
                </div>

                {/* Nro Comprobante */}
                <div className="space-y-1 md:col-span-1">
                  <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">
                    N° de Comprobante / Factura
                  </label>
                  <input
                    type="text"
                    value={nroComprobante}
                    onChange={(e) => setNroComprobante(e.target.value)}
                    placeholder="Ej: FA-0001-00001234"
                    className="w-full bg-surface-container-low border-none rounded-2xl py-3 px-4 text-sm font-bold focus:ring-2 focus:ring-primary/20 shadow-inner"
                  />
                </div>

                {/* Observaciones */}
                <div className="space-y-1 md:col-span-2">
                  <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">
                    Observaciones
                  </label>
                  <input
                    type="text"
                    value={observaciones}
                    onChange={(e) => setObservaciones(e.target.value)}
                    placeholder="Detalles de entrega, flete, condiciones pactadas..."
                    className="w-full bg-surface-container-low border-none rounded-2xl py-3 px-4 text-sm font-bold focus:ring-2 focus:ring-primary/20 shadow-inner"
                  />
                </div>
              </div>
            </div>

            <hr className="border-outline-variant/10" />

            {/* Sección: Ítems de la Compra */}
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-3 text-primary">
                  <span className="material-symbols-outlined font-bold">inventory_2</span>
                  <h4 className="text-sm font-black uppercase tracking-[0.2em]">Ítems a Ingresar</h4>
                </div>
                <button
                  type="button"
                  onClick={handleAddItem}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 text-primary hover:bg-primary hover:text-white rounded-xl text-xs font-bold transition-all active:scale-95"
                >
                  <span className="material-symbols-outlined text-base">add</span>
                  Agregar ítem
                </button>
              </div>

              {/* Lista de Filas */}
              <div className="space-y-3">
                {items.map((item, index) => {
                  const ins = insumos.find((x) => x.id === item.insumoId);
                  const hasUnidadCompra = Boolean(ins?.unidad_compra_nombre);
                  const factor = Number(ins?.factor_compra) || 1;
                  const cantNum = Number(item.cantidad) || 0;
                  const costoNum = Number(item.costoUnitario) || 0;
                  const subtotalNum = cantNum * costoNum;

                  return (
                    <div
                      key={item.rowId}
                      className="p-4 bg-surface-container-low/40 rounded-2xl border border-outline-variant/10 space-y-3 relative transition-all hover:border-primary/20"
                    >
                      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-start">
                        {/* Insumo Combobox */}
                        <div className="md:col-span-5 relative space-y-1">
                          <label className="text-[9px] font-black text-on-surface-variant uppercase tracking-widest ml-1">
                            Insumo #{index + 1} <span className="text-error">*</span>
                          </label>
                          <input
                            type="text"
                            value={item.insumoSearch}
                            onChange={(e) => {
                              updateItemField(index, 'insumoSearch', e.target.value);
                              updateItemField(index, 'isDropdownOpen', true);
                              if (item.insumoId) updateItemField(index, 'insumoId', '');
                            }}
                            onFocus={() => updateItemField(index, 'isDropdownOpen', true)}
                            onBlur={() =>
                              setTimeout(() => updateItemField(index, 'isDropdownOpen', false), 200)
                            }
                            placeholder="Buscar insumo..."
                            className="w-full bg-white border border-outline-variant/10 rounded-xl py-2 px-3 text-xs font-bold text-on-surface focus:ring-2 focus:ring-primary/20 shadow-sm"
                          />

                          {item.isDropdownOpen && (
                            <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white rounded-xl shadow-2xl border border-outline-variant/10 max-h-56 overflow-y-auto">
                              {insumos
                                .filter((i) => {
                                  const query = item.insumoSearch.toLowerCase();
                                  return (
                                    i.nombre.toLowerCase().includes(query) ||
                                    (i.codigo && i.codigo.toLowerCase().includes(query))
                                  );
                                })
                                .map((i) => (
                                  <button
                                    type="button"
                                    key={i.id}
                                    onMouseDown={(e) => {
                                      e.preventDefault();
                                      handleSelectInsumo(index, i);
                                    }}
                                    className="w-full text-left px-3 py-2 text-xs font-bold hover:bg-primary/5 transition-colors border-b border-outline-variant/5 flex justify-between items-center"
                                  >
                                    <div>
                                      <p className="text-on-surface font-extrabold">{i.nombre}</p>
                                      {i.codigo && <p className="text-[10px] text-outline">{i.codigo}</p>}
                                    </div>
                                    <span className="text-[10px] text-outline font-medium">
                                      Stock: {Number(i.stock).toLocaleString('es-AR', { maximumFractionDigits: 3 })} {i.unidad_stock_nombre}
                                    </span>
                                  </button>
                                ))}

                              {insumos.filter((i) => {
                                const query = item.insumoSearch.toLowerCase();
                                return (
                                  i.nombre.toLowerCase().includes(query) ||
                                  (i.codigo && i.codigo.toLowerCase().includes(query))
                                );
                              }).length === 0 && (
                                <p className="px-3 py-2 text-xs text-outline/50 italic">
                                  No hay insumos que coincidan
                                </p>
                              )}
                            </div>
                          )}

                          {ins && (
                            <p className="text-[10px] text-outline font-medium ml-1">
                              Stock actual: {Number(ins.stock).toLocaleString('es-AR', { maximumFractionDigits: 3 })} {ins.unidad_stock_nombre}
                            </p>
                          )}
                        </div>

                        {/* Cantidad */}
                        <div className="md:col-span-2 space-y-1">
                          <label className="text-[9px] font-black text-on-surface-variant uppercase tracking-widest ml-1">
                            Cantidad <span className="text-error">*</span>
                          </label>
                          <input
                            type="number"
                            step="any"
                            min="0.0001"
                            value={item.cantidad}
                            onChange={(e) => updateItemField(index, 'cantidad', e.target.value)}
                            placeholder="0"
                            className="w-full bg-white border border-outline-variant/10 rounded-xl py-2 px-3 text-xs font-black text-primary focus:ring-2 focus:ring-primary/20 shadow-sm"
                          />
                        </div>

                        {/* Selector de Unidad */}
                        <div className="md:col-span-2 space-y-1">
                          <label className="text-[9px] font-black text-on-surface-variant uppercase tracking-widest ml-1">
                            Unidad
                          </label>
                          {ins && hasUnidadCompra ? (
                            <div className="flex flex-col gap-1 text-[11px] pt-1">
                              <label className="flex items-center gap-1.5 cursor-pointer font-bold text-on-surface select-none">
                                <input
                                  type="radio"
                                  name={`unit_${item.rowId}`}
                                  checked={item.enUnidadCompra}
                                  onChange={() => handleUnitToggle(index, true)}
                                  className="text-primary focus:ring-primary/20 text-xs"
                                />
                                {ins.unidad_compra_nombre}
                              </label>
                              <label className="flex items-center gap-1.5 cursor-pointer font-bold text-on-surface select-none">
                                <input
                                  type="radio"
                                  name={`unit_${item.rowId}`}
                                  checked={!item.enUnidadCompra}
                                  onChange={() => handleUnitToggle(index, false)}
                                  className="text-primary focus:ring-primary/20 text-xs"
                                />
                                {ins.unidad_stock_nombre}
                              </label>
                            </div>
                          ) : (
                            <p className="text-xs font-bold text-on-surface pt-2">
                              {ins?.unidad_stock_nombre || '—'}
                            </p>
                          )}
                        </div>

                        {/* Costo Unitario */}
                        <div className="md:col-span-2 space-y-1">
                          <label className="text-[9px] font-black text-on-surface-variant uppercase tracking-widest ml-1">
                            Costo Unit. ($) <span className="text-error">*</span>
                          </label>
                          <input
                            type="number"
                            step="any"
                            min="0"
                            value={item.costoUnitario}
                            onChange={(e) => updateItemField(index, 'costoUnitario', e.target.value)}
                            placeholder="0.00"
                            className="w-full bg-white border border-outline-variant/10 rounded-xl py-2 px-3 text-xs font-bold text-on-surface focus:ring-2 focus:ring-primary/20 shadow-sm"
                          />
                        </div>

                        {/* Subtotal y Botón Quitar */}
                        <div className="md:col-span-1 flex flex-col items-end justify-between pt-5">
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(index)}
                            disabled={items.length <= 1}
                            title="Quitar ítem"
                            className="p-1.5 text-on-surface-variant hover:text-error hover:bg-error/10 rounded-lg transition-all disabled:opacity-30 disabled:hover:bg-transparent"
                          >
                            <span className="material-symbols-outlined text-lg">delete</span>
                          </button>
                        </div>
                      </div>

                      {/* Subtotal del ítem en vivo */}
                      <div className="flex flex-wrap items-center justify-between pt-2 border-t border-outline-variant/5 text-xs">
                        {ins && item.enUnidadCompra && factor !== 1 && cantNum > 0 ? (
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
                            ${subtotalNum.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                          </strong>
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              <p className="text-[11px] text-outline font-medium">
                Si el insumo no existe, crealo primero en{' '}
                <a href="/insumos" target="_blank" rel="noreferrer" className="text-primary font-bold underline">
                  Insumos
                </a>
                .
              </p>
            </div>

            <hr className="border-outline-variant/10" />

            {/* Sección: Total y Forma de Pago */}
            <div className="space-y-6">
              <div className="flex items-center gap-3 text-primary">
                <span className="material-symbols-outlined font-bold">credit_card</span>
                <h4 className="text-sm font-black uppercase tracking-[0.2em]">Condición y Pago</h4>
              </div>

              {/* Total Banner */}
              <div className="p-6 bg-slate-900 text-white rounded-2xl flex items-center justify-between shadow-lg">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                    Total Estimado de la Compra
                  </p>
                  <p className="text-2xl font-headline font-extrabold mt-0.5">
                    ${totalCalculado.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                  </p>
                </div>
                <span className="material-symbols-outlined text-3xl text-primary">shopping_bag</span>
              </div>

              {/* Selector Condición de Pago */}
              <div className="space-y-3">
                <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">
                  Condición de Pago
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setCondicionPago('contado')}
                    className={`p-3 rounded-2xl border text-center transition-all flex items-center justify-center gap-2 text-xs font-black uppercase tracking-wider ${
                      condicionPago === 'contado'
                        ? 'bg-primary text-white shadow-md shadow-primary/20 border-primary'
                        : 'bg-surface-container-low border-outline-variant/10 text-on-surface-variant hover:bg-surface-container-high'
                    }`}
                  >
                    <span className="material-symbols-outlined text-lg">payments</span>
                    Contado
                  </button>
                  <button
                    type="button"
                    onClick={() => setCondicionPago('cuenta_corriente')}
                    className={`p-3 rounded-2xl border text-center transition-all flex items-center justify-center gap-2 text-xs font-black uppercase tracking-wider ${
                      condicionPago === 'cuenta_corriente'
                        ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20 border-indigo-600'
                        : 'bg-surface-container-low border-outline-variant/10 text-on-surface-variant hover:bg-surface-container-high'
                    }`}
                  >
                    <span className="material-symbols-outlined text-lg">account_balance_wallet</span>
                    Cuenta Corriente
                  </button>
                </div>
              </div>

              {/* Campos para Contado */}
              {condicionPago === 'contado' ? (
                <div className="space-y-4 p-5 bg-surface-container-low/40 rounded-2xl border border-outline-variant/10 animate-in fade-in slide-in-from-top-2 duration-300">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Medio de Pago */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">
                        Medio de Pago
                      </label>
                      <select
                        value={formaPago}
                        onChange={(e) => setFormaPago(e.target.value)}
                        className="w-full bg-white border border-outline-variant/10 rounded-2xl py-3 px-4 text-xs font-bold focus:ring-2 focus:ring-primary/20 appearance-none cursor-pointer"
                      >
                        {FORMAS_PAGO.map((fp) => (
                          <option key={fp} value={fp}>
                            {fp}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Descontar de Caja */}
                    <div className="space-y-2 pt-1">
                      <label className="flex items-center gap-2.5 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={descontarCaja}
                          onChange={(e) => setDescontarCaja(e.target.checked)}
                          className="w-4 h-4 rounded text-primary focus:ring-primary/20 border-outline-variant/30"
                        />
                        <span className="text-xs font-headline font-extrabold text-on-surface">
                          Descontar de la caja
                        </span>
                      </label>
                      <p className="text-[10px] font-medium text-outline">
                        Registra la salida como egreso en el turno abierto de caja.
                      </p>
                    </div>
                  </div>

                  {/* Select Tipo de Gasto si descuenta de caja */}
                  {descontarCaja && (
                    <div className="space-y-1 pt-1 animate-in fade-in duration-200">
                      <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">
                        Categoría / Tipo de Gasto (Opcional)
                      </label>
                      <select
                        value={tipoGastoId}
                        onChange={(e) => setTipoGastoId(e.target.value)}
                        className="w-full bg-white border border-outline-variant/10 rounded-2xl py-3 px-4 text-xs font-bold focus:ring-2 focus:ring-primary/20 appearance-none cursor-pointer"
                      >
                        <option value="">Sin especificar</option>
                        {tiposGasto.map((tg) => (
                          <option key={tg.id} value={tg.id}>
                            {tg.nombre}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Advertencia si el efectivo dejaría la caja en negativo */}
                  {showEfectivoWarning && (
                    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center gap-3 text-amber-900 animate-in fade-in duration-300">
                      <span className="material-symbols-outlined text-amber-600 text-2xl shrink-0">warning</span>
                      <p className="text-[11px] font-bold leading-tight">
                        El efectivo esperado en caja es{' '}
                        <strong className="font-black">
                          ${Number(efectivoEsperadoCaja || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                        </strong>
                        ; este pago la dejaría en negativo.
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-4 bg-indigo-50/60 border border-indigo-100 rounded-2xl text-indigo-900 text-xs font-bold animate-in fade-in duration-300">
                  <p>
                    Se carga como deuda con el proveedor. Podés registrar el pago después desde{' '}
                    <a href="/proveedores" target="_blank" rel="noreferrer" className="underline font-black">
                      Proveedores
                    </a>
                    .
                  </p>
                </div>
              )}
            </div>

            {/* Footer Actions */}
            <div className="flex gap-4 pt-4 shrink-0">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-4 bg-white text-on-surface-variant font-bold rounded-2xl hover:bg-slate-100 transition-all border border-outline-variant/20 active:scale-95 text-xs uppercase tracking-widest"
              >
                Cancelar
              </button>
              <button
                disabled={loading}
                type="submit"
                className="flex-[2] py-4 bg-primary text-white font-bold rounded-2xl shadow-xl shadow-primary/20 hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-2 text-xs uppercase tracking-widest disabled:opacity-50"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                ) : (
                  <>
                    <span className="material-symbols-outlined">check_circle</span>
                    <span>Registrar Compra</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Modal de Alta Rápida de Proveedor (Hermano con z-[100] por encima) */}
      {isNewSupplierOpen && (
        <SupplierModal
          initialNombre={supplierSearch}
          onClose={() => setIsNewSupplierOpen(false)}
          onSuccess={(created) => {
            if (created) {
              setSuppliers((prev) =>
                [...prev.filter((s) => s.id !== created.id), { id: created.id, nombre: created.nombre, activo: true }].sort(
                  (a, b) => a.nombre.localeCompare(b.nombre)
                )
              );
              setSelectedSupplier({ id: created.id, nombre: created.nombre, activo: true });
              setSupplierSearch(created.nombre);
            }
          }}
        />
      )}
    </>
  );
};

export default PurchaseModal;
