import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { toast } from 'react-hot-toast';

interface JobCompletionPaymentModalProps {
  job: {
    id: string;
    cliente_id: string;
    cliente_nombre?: string;
    total: number;
    saldo_pendiente: number;
  };
  targetStatus: string;
  onClose: () => void;
  onConfirmed: () => void;
}

const DESCUENTOS = [12, 20, 30, 40, 50, 100];

const JobCompletionPaymentModal: React.FC<JobCompletionPaymentModalProps> = ({ job, targetStatus, onClose, onConfirmed }) => {
  const [descuentoPct, setDescuentoPct] = useState<number>(0);
  const [importe, setImporte] = useState<number>(Number(job.saldo_pendiente) || 0);
  const [metodo, setMetodo] = useState('EFECTIVO');
  const [observaciones, setObservaciones] = useState('');
  const [loading, setLoading] = useState(false);

  const saldoConDescuento = (Number(job.saldo_pendiente) || 0) * (1 - descuentoPct / 100);

  // Cuando cambia el descuento, sugerir el nuevo saldo como importe a cobrar
  useEffect(() => {
    setImporte(Math.round(saldoConDescuento * 100) / 100);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [descuentoPct]);

  const handleConfirm = async () => {
    if (!importe || importe <= 0) {
      toast.error('Ingresá un importe válido');
      return;
    }
    setLoading(true);
    try {
      // RPC atómica: si hay descuento, reduce t_trabajos.total e inserta el pago
      // en la misma transacción — si el insert falla, el total no queda a mitad de camino.
      const { error } = await supabase.rpc('registrar_cobro_cierre_trabajo', {
        p_trabajo_id: job.id,
        p_cliente_id: job.cliente_id,
        p_importe: importe,
        p_metodo: metodo,
        p_descuento_pct: descuentoPct,
        p_observaciones: observaciones || null
      });
      if (error) throw error;

      toast.success('Cobro registrado');
      onConfirmed();
    } catch (err: any) {
      toast.error('Error al registrar el cobro: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[105] flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-md animate-in fade-in duration-300">
      <div className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl border border-white/20 flex flex-col overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-12 duration-500">
        {/* Header */}
        <div className="px-8 py-6 border-b border-outline-variant/10 bg-surface-container-low/30">
          <h3 className="text-xl font-headline font-extrabold text-on-surface tracking-tight">Cobro obligatorio</h3>
          <p className="text-[10px] text-on-surface-variant font-bold uppercase tracking-widest mt-1">
            Para pasar a {targetStatus} hay que registrar el cobro del saldo pendiente
          </p>
        </div>

        <div className="p-8 space-y-6">
          <div className="p-5 bg-error/5 border border-error/20 rounded-3xl flex items-center justify-between">
            <span className="text-[10px] font-black text-error uppercase tracking-widest">Saldo pendiente</span>
            <span className="text-xl font-black text-error">$ {(Number(job.saldo_pendiente) || 0).toLocaleString('es-AR')}</span>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">Descuento</label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setDescuentoPct(0)}
                className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${descuentoPct === 0 ? 'bg-slate-900 text-white' : 'bg-surface-container-low text-on-surface-variant hover:bg-slate-100'}`}
              >
                Sin descuento
              </button>
              {DESCUENTOS.map(pct => (
                <button
                  key={pct}
                  type="button"
                  onClick={() => setDescuentoPct(pct)}
                  className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${descuentoPct === pct ? 'bg-primary text-white' : 'bg-surface-container-low text-on-surface-variant hover:bg-primary/10'}`}
                >
                  {pct}%
                </button>
              ))}
            </div>
            {descuentoPct > 0 && (
              <p className="text-[10px] text-primary font-bold ml-1">
                Nuevo saldo con descuento: $ {saldoConDescuento.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">Importe a cobrar ahora ($)</label>
              <input
                type="number"
                step="0.01"
                value={importe}
                onChange={(e) => setImporte(e.target.value === '' ? 0 : parseFloat(e.target.value))}
                className="w-full bg-surface-container-low border-none rounded-xl py-3 px-4 text-sm font-black text-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">Forma de pago</label>
              <select
                value={metodo}
                onChange={(e) => setMetodo(e.target.value)}
                className="w-full bg-surface-container-low border-none rounded-xl py-3 px-4 text-sm font-bold appearance-none cursor-pointer"
              >
                <option value="EFECTIVO">EFECTIVO</option>
                <option value="TRANSFERENCIA">TRANSFERENCIA</option>
                <option value="CHEQUE">CHEQUE</option>
                <option value="MERCADO PAGO">MERCADO PAGO</option>
                <option value="BANCO">BANCO</option>
                <option value="OTRO">OTRO</option>
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">Observaciones (opcional)</label>
            <input
              type="text"
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              placeholder="Nota interna..."
              className="w-full bg-surface-container-low border-none rounded-xl py-3 px-4 text-sm font-bold"
            />
          </div>

          {importe < saldoConDescuento && (
            <p className="text-[10px] text-amber-600 font-bold ml-1">
              El importe es menor al saldo — el trabajo va a quedar con un saldo pendiente aun después de pasar a {targetStatus}.
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="px-8 py-6 bg-surface-container-low/50 border-t border-outline-variant/10 flex gap-4">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-3.5 bg-white text-on-surface-variant font-bold rounded-2xl hover:bg-slate-100 transition-all border border-outline-variant/20 active:scale-95"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={handleConfirm}
            className="flex-[2] py-3.5 bg-primary text-white font-bold rounded-2xl shadow-xl shadow-primary/20 hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
            ) : (
              <>
                <span className="material-symbols-outlined">payments</span>
                Confirmar cobro y continuar
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default JobCompletionPaymentModal;
