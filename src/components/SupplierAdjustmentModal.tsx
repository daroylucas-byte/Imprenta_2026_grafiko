import React, { useState } from 'react';
import { todayAR } from '../utils/dates';
import { supabase } from '../lib/supabase';
import { toast } from 'react-hot-toast';
import { useForm } from 'react-hook-form';
import { useAuthStore } from '../store/authStore';

interface SupplierAdjustmentModalProps {
  supplier: {
    id: string;
    nombre: string;
    razon_social?: string | null;
  };
  onClose: () => void;
  onSuccess: () => void;
}

interface AdjustmentFormValues {
  tipo: 'cargo' | 'nota_debito' | 'nota_credito';
  monto: string | number;
  concepto: string;
  fecha: string;
}

const TIPO_INFO = {
  cargo: {
    label: 'Deuda anterior / cargo manual',
    subtitle: 'Aumenta la deuda con el proveedor',
    badge: 'Deuda Inicial / Cargo',
    color: 'error',
    icon: 'add_circle',
    helpText: 'Registrá saldos iniciales previos al sistema o cargos directos que incrementan lo adeudado.',
  },
  nota_debito: {
    label: 'Nota de débito',
    subtitle: 'Aumenta la deuda con el proveedor',
    badge: 'Recargo / Débito',
    color: 'error',
    icon: 'post_add',
    helpText: 'Registrá recargos, intereses o correcciones que aumentan el saldo a pagar.',
  },
  nota_credito: {
    label: 'Nota de crédito',
    subtitle: 'Reduce la deuda con el proveedor',
    badge: 'Descuento / Crédito',
    color: 'emerald',
    icon: 'remove_circle',
    helpText: 'Registrá bonificaciones, devoluciones o descuentos otorgados por el proveedor.',
  },
};

const SupplierAdjustmentModal: React.FC<SupplierAdjustmentModalProps> = ({
  supplier,
  onClose,
  onSuccess,
}) => {
  const [loading, setLoading] = useState(false);
  const { user } = useAuthStore();

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<AdjustmentFormValues>({
    defaultValues: {
      tipo: 'cargo',
      fecha: todayAR(),
      monto: '',
      concepto: '',
    },
  });

  const tipo = watch('tipo') || 'cargo';
  const infoActual = TIPO_INFO[tipo];

  const onSubmit = async (data: AdjustmentFormValues) => {
    const numMonto = Number(data.monto);
    if (isNaN(numMonto) || numMonto <= 0) {
      toast.error('Ingresá un monto mayor a 0');
      return;
    }

    const conceptoTrimmed = data.concepto?.trim();
    if (!conceptoTrimmed) {
      toast.error('El concepto es obligatorio');
      return;
    }

    setLoading(true);
    try {
      const { data: rpcData, error } = await supabase.rpc('registrar_ajuste_proveedor', {
        p_proveedor_id: supplier.id,
        p_tipo: data.tipo,
        p_monto: numMonto,
        p_concepto: conceptoTrimmed,
        p_fecha: data.fecha,
        p_usuario_id: user?.id || null,
      });

      if (error) throw error;

      const resultado = rpcData && rpcData[0];
      const nuevoSaldo = Number(resultado?.saldo_pendiente ?? 0);
      const saldoStr = nuevoSaldo.toLocaleString('es-AR', { minimumFractionDigits: 2 });

      toast.success(`Ajuste registrado. Saldo con el proveedor: $${saldoStr}`);
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Supplier adjustment error:', err);
      toast.error('Error al registrar ajuste: ' + (err.message || 'Error inesperado'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300">
      <div className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl border border-white/20 flex flex-col overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-12 duration-500">
        {/* Header */}
        <div className="px-10 py-8 border-b border-outline-variant/10 flex justify-between items-center bg-indigo-50/40">
          <div>
            <h3 className="text-2xl font-headline font-extrabold text-on-surface tracking-tight">
              Ajustar Saldo Proveedor
            </h3>
            <p className="text-[10px] font-black text-indigo-700 uppercase tracking-widest mt-1">
              Proveedor: {supplier.nombre} {supplier.razon_social && supplier.razon_social !== supplier.nombre ? `(${supplier.razon_social})` : ''}
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

        <form onSubmit={handleSubmit(onSubmit)} className="p-10 space-y-6">
          {/* Selector de Tipo de Ajuste */}
          <div className="space-y-2">
            <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">
              Tipo de Ajuste
            </label>
            <div className="grid grid-cols-3 gap-2">
              <label
                className={`flex flex-col items-center justify-center text-center p-3 rounded-2xl border-2 cursor-pointer transition-all ${
                  tipo === 'cargo'
                    ? 'border-error bg-error/5 text-error shadow-sm'
                    : 'border-outline-variant/10 bg-surface-container-low text-on-surface-variant hover:bg-slate-100'
                }`}
              >
                <input type="radio" value="cargo" {...register('tipo')} className="hidden" />
                <span className="material-symbols-outlined text-xl mb-1 text-error">add_circle</span>
                <span className="text-[9px] font-black uppercase tracking-tight leading-tight">Deuda Anterior</span>
                <span className="text-[8px] opacity-70 mt-0.5">(+ Deuda)</span>
              </label>

              <label
                className={`flex flex-col items-center justify-center text-center p-3 rounded-2xl border-2 cursor-pointer transition-all ${
                  tipo === 'nota_debito'
                    ? 'border-error bg-error/5 text-error shadow-sm'
                    : 'border-outline-variant/10 bg-surface-container-low text-on-surface-variant hover:bg-slate-100'
                }`}
              >
                <input type="radio" value="nota_debito" {...register('tipo')} className="hidden" />
                <span className="material-symbols-outlined text-xl mb-1 text-error">post_add</span>
                <span className="text-[9px] font-black uppercase tracking-tight leading-tight">Nota Débito</span>
                <span className="text-[8px] opacity-70 mt-0.5">(+ Deuda)</span>
              </label>

              <label
                className={`flex flex-col items-center justify-center text-center p-3 rounded-2xl border-2 cursor-pointer transition-all ${
                  tipo === 'nota_credito'
                    ? 'border-emerald-500 bg-emerald-50 text-emerald-700 shadow-sm'
                    : 'border-outline-variant/10 bg-surface-container-low text-on-surface-variant hover:bg-slate-100'
                }`}
              >
                <input type="radio" value="nota_credito" {...register('tipo')} className="hidden" />
                <span className="material-symbols-outlined text-xl mb-1 text-emerald-600">remove_circle</span>
                <span className="text-[9px] font-black uppercase tracking-tight leading-tight">Nota Crédito</span>
                <span className="text-[8px] opacity-70 mt-0.5">(− Deuda)</span>
              </label>
            </div>
            <p className="text-[10px] text-outline font-bold mt-1.5 ml-1">
              {infoActual.helpText}
            </p>
          </div>

          {/* Monto */}
          <div className="space-y-1">
            <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">
              Monto del Ajuste ($)
            </label>
            <input
              type="number"
              step="0.01"
              autoFocus
              {...register('monto', { required: 'Ingresá el monto' })}
              placeholder="0.00"
              className="w-full bg-surface-container-low border-none rounded-2xl py-3.5 px-6 text-2xl font-black text-primary focus:ring-2 focus:ring-primary/20 transition-all shadow-inner"
            />
            {errors.monto && <p className="text-[10px] text-error font-bold mt-1 ml-1">{errors.monto.message}</p>}
          </div>

          {/* Fecha */}
          <div className="space-y-1">
            <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">
              Fecha
            </label>
            <input
              type="date"
              {...register('fecha', { required: 'La fecha es requerida' })}
              className="w-full bg-surface-container-low border-none rounded-2xl py-3 px-4 text-sm font-bold focus:ring-2 focus:ring-primary/20 shadow-inner"
            />
            {errors.fecha && <p className="text-[10px] text-error font-bold mt-1 ml-1">{errors.fecha.message}</p>}
          </div>

          {/* Concepto */}
          <div className="space-y-1">
            <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">
              Concepto / Motivo
            </label>
            <textarea
              {...register('concepto', { required: 'Indicá el concepto del ajuste' })}
              rows={2}
              className="w-full bg-surface-container-low border-none rounded-2xl py-3 px-4 text-sm font-bold focus:ring-2 focus:ring-primary/20 resize-none shadow-inner"
              placeholder="Ej: Saldo anterior al 01/09, Descuento por lote fallado, Interés por mora..."
            />
            {errors.concepto && <p className="text-[10px] text-error font-bold mt-1 ml-1">{errors.concepto.message}</p>}
          </div>

          {/* Banner informativo de no impacto en caja */}
          <div className="bg-indigo-50/60 border border-indigo-100 rounded-2xl p-3.5 flex items-center gap-3 text-indigo-900">
            <span className="material-symbols-outlined text-indigo-600 text-xl shrink-0">info</span>
            <p className="text-[10px] font-bold leading-snug">
              Este movimiento es un ajuste contable en la cuenta corriente del proveedor. <span className="font-extrabold text-indigo-950">No afecta la caja.</span>
            </p>
          </div>

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
              className="flex-[2] py-4 bg-indigo-600 text-white font-bold rounded-2xl shadow-xl shadow-indigo-500/20 hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-2 text-[10px] uppercase tracking-widest disabled:opacity-50"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[1.2rem]">receipt_long</span>
                  <span>Confirmar Ajuste</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default SupplierAdjustmentModal;
