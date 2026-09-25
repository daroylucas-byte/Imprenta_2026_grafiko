import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { toast } from 'react-hot-toast';
import { useForm } from 'react-hook-form';
import { useAuthStore } from '../store/authStore';

export interface InsumoStock {
  id: string;
  nombre: string;
  codigo?: string | null;
  categoria_id?: string | null;
  categoria_nombre?: string | null;
  unidad_stock_id: string;
  unidad_stock_nombre: string;
  unidad_compra_id?: string | null;
  unidad_compra_nombre?: string | null;
  factor_compra: number;
  stock: number;
  stock_minimo: number;
  ultimo_costo_compra: number;
  observaciones?: string | null;
  activo: boolean;
  created_at: string;
  bajo_minimo: boolean;
  stock_negativo: boolean;
  stock_en_unidad_compra?: number | null;
  valor_stock?: number | null;
}

interface StockMovementModalProps {
  insumo: InsumoStock;
  onClose: () => void;
  onSuccess: () => void;
}

type TipoMovimiento = 'entrada' | 'salida' | 'devolucion' | 'ajuste';

interface MovementFormValues {
  tipo: TipoMovimiento;
  cantidad: string | number;
  stock_real: string | number;
  en_unidad_compra: boolean;
  motivo: string;
}

const TIPO_OPCIONES: { id: TipoMovimiento; label: string; desc: string; icon: string; activeClass: string }[] = [
  {
    id: 'entrada',
    label: 'Entrada',
    desc: 'Ingreso de mercadería',
    icon: 'add_circle',
    activeClass: 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/20 border-emerald-600',
  },
  {
    id: 'salida',
    label: 'Salida',
    desc: 'Consumo o uso',
    icon: 'remove_circle',
    activeClass: 'bg-error text-white shadow-lg shadow-error/20 border-error',
  },
  {
    id: 'ajuste',
    label: 'Ajuste',
    desc: 'Conteo físico',
    icon: 'tune',
    activeClass: 'bg-amber-500 text-white shadow-lg shadow-amber-500/20 border-amber-500',
  },
  {
    id: 'devolucion',
    label: 'Devolución',
    desc: 'Devolución o reintegro',
    icon: 'assignment_return',
    activeClass: 'bg-sky-600 text-white shadow-lg shadow-sky-600/20 border-sky-600',
  },
];

const StockMovementModal: React.FC<StockMovementModalProps> = ({ insumo, onClose, onSuccess }) => {
  const [loading, setLoading] = useState(false);
  const { user } = useAuthStore();

  const hasUnidadCompra = Boolean(insumo.unidad_compra_id && insumo.unidad_compra_nombre);
  const factor = Number(insumo.factor_compra) || 1;
  const currentStock = Number(insumo.stock) || 0;

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<MovementFormValues>({
    defaultValues: {
      tipo: 'entrada',
      cantidad: '',
      stock_real: '',
      en_unidad_compra: false,
      motivo: '',
    },
  });

  const tipo = watch('tipo');
  const cantidadVal = watch('cantidad');
  const stockRealVal = watch('stock_real');
  const enUnidadCompra = watch('en_unidad_compra');

  // Cálculos para la vista previa en vivo (solo informativos)
  const isAjuste = tipo === 'ajuste';
  const rawCant = Number(cantidadVal) || 0;
  const rawStockReal = Number(stockRealVal) || 0;

  const multiplier = enUnidadCompra ? factor : 1;
  const cantInStockUnits = rawCant * multiplier;
  const stockRealInStockUnits = rawStockReal * multiplier;

  let projectedStock = currentStock;
  let diffAjuste = 0;

  if (isAjuste) {
    projectedStock = stockRealInStockUnits;
    diffAjuste = stockRealInStockUnits - currentStock;
  } else if (tipo === 'entrada' || tipo === 'devolucion') {
    projectedStock = currentStock + cantInStockUnits;
  } else if (tipo === 'salida') {
    projectedStock = currentStock - cantInStockUnits;
  }

  const willBeNegative = projectedStock < 0;

  const getMotivoPlaceholder = () => {
    switch (tipo) {
      case 'entrada':
        return 'Ej: Compra factura 123 / Remito 456';
      case 'salida':
        return 'Ej: Trabajo Folletos X / Merma de producción';
      case 'devolucion':
        return 'Ej: Devolución a proveedor / Sobrante de corte';
      case 'ajuste':
        return 'Ej: Conteo físico del 30/9';
      default:
        return 'Motivo del movimiento...';
    }
  };

  const onSubmit = async (formData: MovementFormValues) => {
    if (isAjuste) {
      if (formData.stock_real === '' || isNaN(Number(formData.stock_real)) || Number(formData.stock_real) < 0) {
        toast.error('Ingresá un stock real válido (mayor o igual a 0)');
        return;
      }
      if (!formData.motivo?.trim()) {
        toast.error('El motivo es obligatorio en los ajustes de inventario');
        return;
      }
    } else {
      const cant = Number(formData.cantidad);
      if (isNaN(cant) || cant <= 0) {
        toast.error('Ingresá una cantidad válida mayor a 0');
        return;
      }
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('registrar_movimiento_stock', {
        p_insumo_id: insumo.id,
        p_tipo: formData.tipo,
        p_cantidad: isAjuste ? null : Number(formData.cantidad),
        p_stock_objetivo: isAjuste ? Number(formData.stock_real) : null,
        p_en_unidad_compra: hasUnidadCompra ? Boolean(formData.en_unidad_compra) : false,
        p_motivo: formData.motivo?.trim() || null,
        p_referencia_tipo: 'manual',
        p_referencia_id: null,
        p_usuario_id: user?.id || null,
      });

      if (error) throw error;

      const resultado = data && data[0];
      const stockNuevo = resultado ? Number(resultado.stock_nuevo) : projectedStock;
      const stockNuevoFormatted = stockNuevo.toLocaleString('es-AR', { maximumFractionDigits: 3 });

      toast.success(`Movimiento registrado. Stock actual: ${stockNuevoFormatted} ${insumo.unidad_stock_nombre}`);
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Error registering movement:', err);
      // Los mensajes de la base vienen en español
      toast.error(err.message || 'Error al registrar el movimiento');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300">
      <div className="bg-white w-full max-w-xl rounded-[2.5rem] shadow-2xl border border-white/20 flex flex-col overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-12 duration-500">
        {/* Header con información del Insumo */}
        <div className="px-10 py-8 border-b border-outline-variant/10 flex justify-between items-start bg-surface-container-low/30 shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-xl">swap_horiz</span>
              <h3 className="text-2xl font-headline font-extrabold text-on-surface tracking-tight">
                Registrar Movimiento
              </h3>
            </div>
            <p className="text-sm font-extrabold text-on-surface mt-1">
              {insumo.nombre}
              {insumo.codigo ? (
                <span className="ml-2 text-xs font-bold text-outline uppercase tracking-wider bg-surface-container-high px-2 py-0.5 rounded-md">
                  {insumo.codigo}
                </span>
              ) : null}
            </p>
            <div className="flex items-center gap-2 mt-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
                Stock actual:
              </span>
              <span className="text-sm font-black text-primary">
                {currentStock.toLocaleString('es-AR', { maximumFractionDigits: 3 })} {insumo.unidad_stock_nombre}
              </span>
              {hasUnidadCompra && insumo.stock_en_unidad_compra !== null && insumo.stock_en_unidad_compra !== undefined && (
                <span className="text-xs font-bold text-outline">
                  (= {Number(insumo.stock_en_unidad_compra).toLocaleString('es-AR', { maximumFractionDigits: 3 })} {insumo.unidad_compra_nombre})
                </span>
              )}
            </div>
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
        <form onSubmit={handleSubmit(onSubmit)} className="p-10 space-y-6 overflow-y-auto max-h-[75vh]">
          {/* Selector de Tipo de Movimiento */}
          <div className="space-y-2">
            <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">
              Tipo de Movimiento <span className="text-error">*</span>
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {TIPO_OPCIONES.map((opc) => {
                const isSelected = tipo === opc.id;
                return (
                  <button
                    key={opc.id}
                    type="button"
                    onClick={() => setValue('tipo', opc.id)}
                    className={`p-3 rounded-2xl border text-left transition-all flex flex-col justify-between ${
                      isSelected
                        ? opc.activeClass
                        : 'bg-surface-container-low border-outline-variant/10 text-on-surface hover:bg-surface-container-high'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full mb-1">
                      <span className="material-symbols-outlined text-xl">{opc.icon}</span>
                      {isSelected && <span className="material-symbols-outlined text-sm">check</span>}
                    </div>
                    <div>
                      <p className="text-xs font-headline font-extrabold leading-tight">{opc.label}</p>
                      <p
                        className={`text-[9px] font-bold tracking-tight mt-0.5 ${
                          isSelected ? 'text-white/80' : 'text-outline'
                        }`}
                      >
                        {opc.desc}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Cantidad / Stock Real */}
          <div className="space-y-3">
            {!isAjuste ? (
              <div className="space-y-1">
                <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">
                  Cantidad a {tipo === 'entrada' ? 'Ingresar' : tipo === 'salida' ? 'Descargar' : 'Devolver'} <span className="text-error">*</span>
                </label>
                <input
                  type="number"
                  step="any"
                  min="0.0001"
                  autoFocus
                  {...register('cantidad', { required: !isAjuste, min: 0.0001 })}
                  placeholder="0"
                  className="w-full bg-surface-container-low border-none rounded-2xl py-3.5 px-6 text-2xl font-black text-primary focus:ring-2 focus:ring-primary/20 transition-all shadow-inner"
                />
                {errors.cantidad && (
                  <p className="text-[10px] text-error font-bold mt-1 ml-1">Ingresá una cantidad válida</p>
                )}
              </div>
            ) : (
              <div className="space-y-1">
                <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">
                  Stock Real Contado <span className="text-error">*</span>
                </label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  autoFocus
                  {...register('stock_real', { required: isAjuste, min: 0 })}
                  placeholder="0"
                  className="w-full bg-surface-container-low border-none rounded-2xl py-3.5 px-6 text-2xl font-black text-amber-600 focus:ring-2 focus:ring-amber-500/20 transition-all shadow-inner"
                />
                <p className="text-[10px] text-outline font-bold mt-1 ml-1">
                  Indicá cuánto hay realmente; el sistema calcula la diferencia automáticamente.
                </p>
                {errors.stock_real && (
                  <p className="text-[10px] text-error font-bold mt-1 ml-1">Ingresá el stock contado</p>
                )}
              </div>
            )}

            {/* Selector de Unidad si el insumo tiene unidad de compra */}
            {hasUnidadCompra && (
              <div className="p-3 bg-surface-container-low/60 rounded-2xl border border-outline-variant/10 flex flex-wrap items-center justify-between gap-3">
                <span className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest">
                  Cantidad expresada en:
                </span>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="radio"
                      name="unit_choice"
                      checked={!enUnidadCompra}
                      onChange={() => setValue('en_unidad_compra', false)}
                      className="text-primary focus:ring-primary/20"
                    />
                    <span className="text-xs font-extrabold text-on-surface">{insumo.unidad_stock_nombre}</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="radio"
                      name="unit_choice"
                      checked={enUnidadCompra}
                      onChange={() => setValue('en_unidad_compra', true)}
                      className="text-primary focus:ring-primary/20"
                    />
                    <span className="text-xs font-extrabold text-on-surface">
                      {insumo.unidad_compra_nombre} (×{factor})
                    </span>
                  </label>
                </div>
              </div>
            )}
          </div>

          {/* Motivo */}
          <div className="space-y-1">
            <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">
              Motivo / Observación {isAjuste && <span className="text-error">*</span>}
            </label>
            <input
              {...register('motivo', { required: isAjuste ? 'El motivo es obligatorio en ajustes' : false })}
              placeholder={getMotivoPlaceholder()}
              className="w-full bg-surface-container-low border-none rounded-2xl py-3 px-4 text-sm font-bold focus:ring-2 focus:ring-primary/20 shadow-inner"
            />
            {errors.motivo && (
              <p className="text-[10px] text-error font-bold mt-1 ml-1">{errors.motivo.message}</p>
            )}
          </div>

          {/* Vista Previa en Vivo */}
          <div className="p-4 bg-slate-50 rounded-2xl border border-outline-variant/10 space-y-2">
            <div className="flex justify-between items-center text-xs">
              <span className="font-bold text-on-surface-variant uppercase tracking-wider text-[10px]">
                Vista previa del balance:
              </span>
              {isAjuste && (
                <span
                  className={`text-xs font-black ${
                    diffAjuste > 0
                      ? 'text-emerald-600'
                      : diffAjuste < 0
                      ? 'text-error'
                      : 'text-on-surface-variant'
                  }`}
                >
                  Diferencia: {diffAjuste > 0 ? '+' : ''}
                  {diffAjuste.toLocaleString('es-AR', { maximumFractionDigits: 3 })} {insumo.unidad_stock_nombre}
                </span>
              )}
            </div>
            <div className="flex items-center justify-between pt-1">
              <span className="text-xs font-bold text-on-surface">
                Stock actual: <strong className="font-black">{currentStock.toLocaleString('es-AR', { maximumFractionDigits: 3 })}</strong>
              </span>
              <span className="material-symbols-outlined text-outline">arrow_forward</span>
              <span
                className={`text-sm font-black ${
                  projectedStock < 0 ? 'text-error' : 'text-primary'
                }`}
              >
                Quedará: {projectedStock.toLocaleString('es-AR', { maximumFractionDigits: 3 })} {insumo.unidad_stock_nombre}
              </span>
            </div>
          </div>

          {/* Advertencia si queda en negativo (no bloquea) */}
          {willBeNegative && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center gap-3 text-amber-900 animate-in fade-in duration-300">
              <span className="material-symbols-outlined text-amber-600 text-2xl shrink-0">warning</span>
              <p className="text-[11px] font-bold leading-tight">
                Este movimiento dejaría el stock en negativo. Revisá si falta cargar una compra.
              </p>
            </div>
          )}

          {/* Footer Actions */}
          <div className="flex gap-4 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-4 bg-white text-on-surface-variant font-bold rounded-2xl hover:bg-slate-100 transition-all border border-outline-variant/20 text-[10px] uppercase tracking-widest active:scale-95"
            >
              Cancelar
            </button>
            <button
              disabled={loading}
              type="submit"
              className="flex-[2] py-4 bg-primary text-white font-bold rounded-2xl shadow-xl shadow-primary/20 hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-2 text-[10px] uppercase tracking-widest disabled:opacity-50"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
              ) : (
                <>
                  <span className="material-symbols-outlined text-lg">check_circle</span>
                  <span>Confirmar Movimiento</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default StockMovementModal;
