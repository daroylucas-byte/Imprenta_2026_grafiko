import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { toast } from 'react-hot-toast';
import { useForm } from 'react-hook-form';

interface AdjustmentModalProps {
  client: {
    id: string;
    razon_social: string;
  };
  onClose: () => void;
  onSuccess: () => void;
}

interface FormValues {
  tipo: 'credito' | 'debito';
  monto: string;
  motivo: string;
  fecha: string;
}

const AdjustmentModal: React.FC<AdjustmentModalProps> = ({ client, onClose, onSuccess }) => {
  const [loading, setLoading] = useState(false);

  const { register, handleSubmit, watch, formState: { errors } } = useForm<FormValues>({
    defaultValues: {
      tipo: 'credito',
      fecha: new Date().toISOString().split('T')[0],
      monto: '',
      motivo: '',
    }
  });

  const tipo = watch('tipo');

  const onSubmit = async (data: FormValues) => {
    setLoading(true);
    try {
      const { error } = await supabase.from('t_ajustes_cc').insert([{
        cliente_id: client.id,
        tipo: data.tipo,
        monto: Number(data.monto),
        motivo: data.motivo,
        fecha: data.fecha,
      }]);

      if (error) throw error;

      toast.success(data.tipo === 'credito' ? 'Nota de crédito registrada' : 'Nota de débito registrada');
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Adjustment Error:', err);
      toast.error('Error al registrar ajuste: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300">
      <div className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl border border-white/20 flex flex-col overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-12 duration-500">
        <div className="px-10 py-8 border-b border-outline-variant/10 flex justify-between items-center bg-indigo-50/30">
          <div>
            <h3 className="text-2xl font-headline font-extrabold text-on-surface tracking-tight">Ajustar Saldo</h3>
            <p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest mt-1">Cliente: {client.razon_social}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-error/10 text-on-surface-variant hover:text-error rounded-full transition-all">
            <span className="material-symbols-outlined text-2xl">close</span>
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="p-10 space-y-6">
          <div className="grid grid-cols-2 gap-3">
            <label className={`flex flex-col items-center justify-center gap-2 py-4 rounded-2xl border-2 cursor-pointer transition-all ${tipo === 'credito' ? 'border-emerald-500 bg-emerald-50' : 'border-outline-variant/10 bg-surface-container-low'}`}>
              <input type="radio" value="credito" {...register('tipo', { required: true })} className="hidden" />
              <span className="material-symbols-outlined text-emerald-600">remove_circle</span>
              <span className="text-[10px] font-black uppercase tracking-widest text-emerald-700">Nota de Crédito</span>
              <span className="text-[9px] text-on-surface-variant font-bold">Reduce la deuda</span>
            </label>
            <label className={`flex flex-col items-center justify-center gap-2 py-4 rounded-2xl border-2 cursor-pointer transition-all ${tipo === 'debito' ? 'border-error bg-error/5' : 'border-outline-variant/10 bg-surface-container-low'}`}>
              <input type="radio" value="debito" {...register('tipo', { required: true })} className="hidden" />
              <span className="material-symbols-outlined text-error">add_circle</span>
              <span className="text-[10px] font-black uppercase tracking-widest text-error">Nota de Débito</span>
              <span className="text-[9px] text-on-surface-variant font-bold">Aumenta la deuda</span>
            </label>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">Importe ($)</label>
            <input
              type="number" step="0.01" autoFocus
              {...register('monto', { required: true, min: 0.01 })}
              placeholder="0.00"
              className="w-full bg-surface-container-low border-none rounded-2xl py-4 px-6 text-2xl font-black text-primary focus:ring-2 focus:ring-primary/20 transition-all shadow-inner"
            />
            {errors.monto && <p className="text-[10px] text-error font-bold mt-1 ml-1">Ingresa un monto válido</p>}
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">Fecha</label>
            <input
              type="date"
              {...register('fecha', { required: true })}
              className="w-full bg-surface-container-low border-none rounded-2xl py-3 px-4 text-sm font-bold focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">Motivo</label>
            <textarea
              {...register('motivo', { required: true })}
              rows={2}
              className="w-full bg-surface-container-low border-none rounded-2xl py-3 px-4 text-sm font-bold focus:ring-2 focus:ring-primary/20 resize-none"
              placeholder="Ej: Bonificación por demora, error de facturación, interés por mora..."
            />
            {errors.motivo && <p className="text-[10px] text-error font-bold mt-1 ml-1">Indicá el motivo del ajuste</p>}
          </div>

          <div className="flex gap-4 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-4 bg-white text-on-surface-variant font-bold rounded-2xl hover:bg-slate-100 transition-all border border-outline-variant/20 text-[10px] uppercase tracking-widest"
            >
              Cancelar
            </button>
            <button
              disabled={loading}
              type="submit"
              className="flex-[2] py-4 bg-indigo-600 text-white font-bold rounded-2xl shadow-xl shadow-indigo-500/20 hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-2 text-[10px] uppercase tracking-widest"
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

export default AdjustmentModal;
