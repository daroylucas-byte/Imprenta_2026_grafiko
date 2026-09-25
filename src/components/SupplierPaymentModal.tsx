import React, { useState, useEffect } from 'react';
import { todayAR } from '../utils/dates';
import { supabase } from '../lib/supabase';
import { toast } from 'react-hot-toast';
import { useForm } from 'react-hook-form';
import { useAuthStore } from '../store/authStore';

interface SupplierPaymentModalProps {
  supplier: {
    id: string;
    nombre: string;
    razon_social?: string | null;
    saldo_pendiente?: number;
  };
  onClose: () => void;
  onSuccess: () => void;
}

interface PaymentFormValues {
  monto: string | number;
  forma_pago: string;
  fecha: string;
  referencia: string;
  descontar_caja: boolean;
  tipo_gasto_id: string;
}

const METODOS_PAGO = [
  'Efectivo',
  'Transferencia',
  'Cheque',
  'Mercado Pago',
  'QR',
  'Banco',
  'Otro',
];

const SupplierPaymentModal: React.FC<SupplierPaymentModalProps> = ({
  supplier,
  onClose,
  onSuccess,
}) => {
  const [loading, setLoading] = useState(false);
  const [tiposGasto, setTiposGasto] = useState<{ id: string; nombre: string }[]>([]);
  const [efectivoEsperadoCaja, setEfectivoEsperadoCaja] = useState<number | null>(null);
  const { user } = useAuthStore();

  const saldoPendienteNum = Math.max(0, Number(supplier.saldo_pendiente || 0));

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<PaymentFormValues>({
    defaultValues: {
      monto: saldoPendienteNum > 0 ? saldoPendienteNum : '',
      forma_pago: 'Efectivo',
      fecha: todayAR(),
      referencia: '',
      descontar_caja: true,
      tipo_gasto_id: '',
    },
  });

  const montoActual = watch('monto');
  const formaPagoActual = watch('forma_pago');
  const descontarCajaActual = watch('descontar_caja');

  // Cargar tipos de gasto de la base
  useEffect(() => {
    const fetchTiposGasto = async () => {
      const { data, error } = await supabase
        .from('t_conf_tipos_gasto')
        .select('id, nombre')
        .order('nombre');
      if (!error && data) {
        setTiposGasto(data);
      }
    };
    fetchTiposGasto();
  }, []);

  // Consultar efectivo esperado en caja si forma de pago es Efectivo y descuenta de caja
  useEffect(() => {
    if (formaPagoActual === 'Efectivo' && descontarCajaActual) {
      const fetchEfectivoCaja = async () => {
        try {
          const { data, error } = await supabase
            .from('v_caja_efectivo_actual')
            .select('efectivo_esperado')
            .maybeSingle();

          if (!error && data) {
            setEfectivoEsperadoCaja(Number(data.efectivo_esperado || 0));
          } else {
            setEfectivoEsperadoCaja(null);
          }
        } catch {
          setEfectivoEsperadoCaja(null);
        }
      };
      fetchEfectivoCaja();
    } else {
      setEfectivoEsperadoCaja(null);
    }
  }, [formaPagoActual, descontarCajaActual]);

  const handlePagarTodo = () => {
    if (saldoPendienteNum > 0) {
      setValue('monto', saldoPendienteNum, { shouldValidate: true });
    }
  };

  const numMonto = Number(montoActual) || 0;
  const showEfectivoWarning =
    formaPagoActual === 'Efectivo' &&
    descontarCajaActual &&
    efectivoEsperadoCaja !== null &&
    numMonto > efectivoEsperadoCaja;

  const onSubmit = async (data: PaymentFormValues) => {
    const monto = Number(data.monto);
    if (isNaN(monto) || monto <= 0) {
      toast.error('Ingresá un monto válido mayor a 0');
      return;
    }

    setLoading(true);
    try {
      const { data: rpcData, error } = await supabase.rpc('registrar_pago_proveedor', {
        p_proveedor_id: supplier.id,
        p_monto: monto,
        p_forma_pago: data.forma_pago,
        p_fecha: data.fecha,
        p_referencia: data.referencia?.trim() || null,
        p_registrar_en_caja: data.descontar_caja,
        p_tipo_gasto_id: data.descontar_caja && data.tipo_gasto_id ? data.tipo_gasto_id : null,
        p_usuario_id: user?.id || null,
      });

      if (error) throw error;

      const resultado = rpcData && rpcData[0];
      const nuevoSaldo = Number(resultado?.saldo_pendiente ?? 0);
      const saldoStr = nuevoSaldo.toLocaleString('es-AR', { minimumFractionDigits: 2 });

      toast.success(`Pago registrado. Saldo con el proveedor: $${saldoStr}`);
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Supplier payment error:', err);
      // Mensaje de error de Postgres/RPC tal cual viene en español
      toast.error(err.message || 'Error al registrar el pago');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300">
      <div className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl border border-white/20 flex flex-col overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-12 duration-500">
        {/* Header */}
        <div className="px-10 py-8 border-b border-outline-variant/10 flex justify-between items-center bg-emerald-50/40">
          <div>
            <h3 className="text-2xl font-headline font-extrabold text-on-surface tracking-tight">
              Registrar Pago a Proveedor
            </h3>
            <p className="text-[10px] font-black text-emerald-700 uppercase tracking-widest mt-1">
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
          {/* Saldo actual de ayuda */}
          <div className="bg-surface-container-low/60 p-4 rounded-2xl border border-outline-variant/10 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
                Saldo Actual con Proveedor
              </p>
              <p
                className={`text-lg font-headline font-extrabold ${
                  Number(supplier.saldo_pendiente || 0) > 0 ? 'text-error' : 'text-emerald-600'
                }`}
              >
                ${Number(supplier.saldo_pendiente || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                <span className="text-[10px] font-bold uppercase ml-1.5 text-on-surface-variant">
                  {Number(supplier.saldo_pendiente || 0) > 0 ? '(Le debemos)' : '(Al día / A favor)'}
                </span>
              </p>
            </div>
            {saldoPendienteNum > 0 && (
              <button
                type="button"
                onClick={handlePagarTodo}
                className="px-3 py-1.5 bg-emerald-600/10 text-emerald-700 hover:bg-emerald-600 hover:text-white rounded-xl text-[10px] font-black uppercase tracking-wider transition-all"
              >
                Pagar todo
              </button>
            )}
          </div>

          {/* Monto */}
          <div className="space-y-1">
            <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">
              Importe a Pagar ($) <span className="text-error">*</span>
            </label>
            <input
              type="number"
              step="0.01"
              autoFocus
              {...register('monto', { required: 'El monto es obligatorio', min: 0.01 })}
              placeholder="0.00"
              className="w-full bg-surface-container-low border-none rounded-2xl py-3.5 px-6 text-2xl font-black text-primary focus:ring-2 focus:ring-primary/20 transition-all shadow-inner"
            />
            {errors.monto && <p className="text-[10px] text-error font-bold mt-1 ml-1">{errors.monto.message}</p>}
          </div>

          {/* Fecha y Medio de Pago */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">
                Fecha
              </label>
              <input
                type="date"
                {...register('fecha', { required: 'La fecha es requerida' })}
                className="w-full bg-surface-container-low border-none rounded-2xl py-3 px-4 text-sm font-bold focus:ring-2 focus:ring-primary/20 shadow-inner"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">
                Medio de Pago
              </label>
              <select
                {...register('forma_pago', { required: true })}
                className="w-full bg-surface-container-low border-none rounded-2xl py-3 px-4 text-sm font-bold focus:ring-2 focus:ring-primary/20 appearance-none cursor-pointer"
              >
                {METODOS_PAGO.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Referencia */}
          <div className="space-y-1">
            <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">
              Referencia / Comprobante
            </label>
            <input
              {...register('referencia')}
              placeholder="Ej: Recibo 123, Transf. #0045, Cheque #8721"
              className="w-full bg-surface-container-low border-none rounded-2xl py-3 px-4 text-sm font-bold focus:ring-2 focus:ring-primary/20 shadow-inner"
            />
          </div>

          {/* Checkbox Descontar de la caja */}
          <div className="space-y-3 pt-2">
            <label className="flex items-center gap-3 p-3 bg-surface-container-low/50 rounded-2xl border border-outline-variant/10 cursor-pointer hover:bg-surface-container-low transition-colors">
              <input
                type="checkbox"
                {...register('descontar_caja')}
                className="w-5 h-5 rounded-lg text-emerald-600 focus:ring-emerald-500 border-outline-variant/30"
              />
              <div className="flex-1">
                <p className="text-xs font-headline font-extrabold text-on-surface">
                  Descontar de la caja
                </p>
                <p className="text-[10px] font-bold text-on-surface-variant">
                  Registra automáticamente una salida de egreso en la caja abierta del local.
                </p>
              </div>
            </label>

            {/* Select Tipo de Gasto (si descuenta de caja) */}
            {descontarCajaActual && (
              <div className="space-y-1 animate-in fade-in slide-in-from-top-2 duration-300">
                <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">
                  Tipo de Gasto (Opcional para Caja)
                </label>
                <select
                  {...register('tipo_gasto_id')}
                  className="w-full bg-surface-container-low border-none rounded-2xl py-3 px-4 text-sm font-bold focus:ring-2 focus:ring-primary/20 appearance-none cursor-pointer"
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
          </div>

          {/* Advertencia si el efectivo dejaría la caja en negativo */}
          {showEfectivoWarning && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center gap-3 text-amber-900 animate-in fade-in duration-300">
              <span className="material-symbols-outlined text-amber-600 text-2xl shrink-0">warning</span>
              <p className="text-[11px] font-bold leading-tight">
                El efectivo esperado en caja es <span className="font-black">${Number(efectivoEsperadoCaja || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>; este pago lo dejaría en negativo.
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
              className="flex-[2] py-4 bg-emerald-600 text-white font-bold rounded-2xl shadow-xl shadow-emerald-500/20 hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-2 text-[10px] uppercase tracking-widest disabled:opacity-50"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[1.2rem]">payments</span>
                  <span>Confirmar Pago</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default SupplierPaymentModal;
