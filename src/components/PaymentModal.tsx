import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { toast } from 'react-hot-toast';
import { useForm } from 'react-hook-form';

interface PaymentModalProps {
  client: {
    id: string;
    razon_social: string;
  };
  onClose: () => void;
  onSuccess: () => void;
}

const PaymentModal: React.FC<PaymentModalProps> = ({ client, onClose, onSuccess }) => {
  const [loading, setLoading] = useState(false);
  
  const { register, handleSubmit, formState: { errors } } = useForm({
    defaultValues: {
      cliente_id: client.id,
      fecha: new Date().toISOString().split('T')[0],
      monto: '',
      metodo: 'Efectivo',
      observaciones: `Cobro a cuenta: ${client.razon_social}`,
    }
  });

  const onSubmit = async (data: any) => {
    setLoading(true);
    try {
      // 1. Create the Recibo (Main entry)
      const { data: recibo, error: reciboError } = await supabase
        .from('t_recibos')
        .insert([{
          cliente_id: data.cliente_id,
          fecha: data.fecha,
          total: Number(data.monto),
          observaciones: data.observaciones,
          numero: `REC-${Date.now().toString().slice(-6)}` // Simple auto-number
        }])
        .select()
        .single();

      if (reciboError) throw reciboError;

      // 2. Create the item detail
      const { error: itemError } = await supabase
        .from('t_recibo_items')
        .insert([{
          recibo_id: recibo.id,
          tipo: data.metodo,
          importe: Number(data.monto),
          observaciones: 'Pago general recibido'
        }]);

      if (itemError) throw itemError;

      toast.success('Cobro registrado correctamente');
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Payment Error:', err);
      toast.error('Error al registrar cobro: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300">
      <div className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl border border-white/20 flex flex-col overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-12 duration-500">
        <div className="px-10 py-8 border-b border-outline-variant/10 flex justify-between items-center bg-emerald-50/30">
          <div>
            <h3 className="text-2xl font-headline font-extrabold text-on-surface tracking-tight">Registrar Cobro</h3>
            <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mt-1">Cliente: {client.razon_social}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-error/10 text-on-surface-variant hover:text-error rounded-full transition-all">
            <span className="material-symbols-outlined text-2xl">close</span>
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="p-10 space-y-6">
          <div className="space-y-1">
            <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">Importe a Cobrar ($)</label>
            <input 
              type="number" step="0.01" autoFocus
              {...register('monto', { required: true, min: 0.01 })}
              placeholder="0.00"
              className="w-full bg-surface-container-low border-none rounded-2xl py-4 px-6 text-2xl font-black text-primary focus:ring-2 focus:ring-primary/20 transition-all shadow-inner"
            />
            {errors.monto && <p className="text-[10px] text-error font-bold mt-1 ml-1">Ingresa un monto válido</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">Fecha</label>
              <input 
                type="date"
                {...register('fecha', { required: true })}
                className="w-full bg-surface-container-low border-none rounded-2xl py-3 px-4 text-sm font-bold focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">Medio de Pago</label>
              <select 
                {...register('metodo', { required: true })}
                className="w-full bg-surface-container-low border-none rounded-2xl py-3 px-4 text-sm font-bold focus:ring-2 focus:ring-primary/20 appearance-none"
              >
                <option>Efectivo</option>
                <option>Transferencia</option>
                <option>Cheque</option>
                <option>Mercado Pago</option>
                <option>Otro</option>
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">Observaciones / Nota</label>
            <textarea 
              {...register('observaciones')}
              rows={2}
              className="w-full bg-surface-container-low border-none rounded-2xl py-3 px-4 text-sm font-bold focus:ring-2 focus:ring-primary/20 resize-none"
              placeholder="Ej: Pago de cuota, Saldo factura #..."
            />
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
              className="flex-[2] py-4 bg-emerald-600 text-white font-bold rounded-2xl shadow-xl shadow-emerald-500/20 hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-2 text-[10px] uppercase tracking-widest"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[1.2rem]">payments</span>
                  <span>Confirmar Cobro</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PaymentModal;
