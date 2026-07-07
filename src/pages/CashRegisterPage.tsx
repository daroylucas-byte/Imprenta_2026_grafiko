import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { toast } from 'react-hot-toast';
import { useForm } from 'react-hook-form';
import { useAuthStore } from '../store/authStore';

// Interfaces
interface OpenCajaInfo {
  apertura_caja_id: string;
  saldo_inicio: number;
  total_ingresos: number;
  total_egresos: number;
  saldo_actual: number;
}

interface MovimientoCaja {
  id: string;
  apertura_caja_id: string;
  tipo: 'ingreso' | 'egreso';
  metodo: string;
  monto: number;
  descripcion: string;
  recibo_id: string | null;
  created_at: string;
  t_recibos: any;
}

// Sub-components: Modals
interface AbrirCajaModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

const AbrirCajaModal: React.FC<AbrirCajaModalProps> = ({ onClose, onSuccess }) => {
  const [loading, setLoading] = useState(false);
  const { user } = useAuthStore();
  const { register, handleSubmit, formState: { errors } } = useForm({
    defaultValues: {
      saldo_inicio: '0.00',
    }
  });

  const onSubmit = async (data: any) => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('t_aperturas_caja')
        .insert([{
          usuario_id: user?.id || null,
          fecha_apertura: new Date().toISOString().split('T')[0],
          saldo_inicio: Number(data.saldo_inicio),
          fecha_cierre: null,
          saldo_cierre: null
        }]);

      if (error) throw error;

      toast.success('Caja abierta correctamente');
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Error opening box:', err);
      toast.error('Error al abrir caja: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300">
      <div className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl border border-white/20 flex flex-col overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-12 duration-500">
        <div className="px-10 py-8 border-b border-outline-variant/10 flex justify-between items-center bg-indigo-50/30">
          <div>
            <h3 className="text-2xl font-headline font-extrabold text-on-surface tracking-tight">Apertura de Caja</h3>
            <p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest mt-1">Iniciar saldo en efectivo</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-error/10 text-on-surface-variant hover:text-error rounded-full transition-all">
            <span className="material-symbols-outlined text-2xl">close</span>
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="p-10 space-y-6">
          <div className="space-y-1">
            <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">Saldo Inicial ($)</label>
            <input 
              type="number" step="0.01" autoFocus
              {...register('saldo_inicio', { required: true, min: 0 })}
              placeholder="0.00"
              className="w-full bg-surface-container-low border-none rounded-2xl py-4 px-6 text-2xl font-black text-primary focus:ring-2 focus:ring-primary/20 transition-all shadow-inner"
            />
            {errors.saldo_inicio && <p className="text-[10px] text-error font-bold mt-1 ml-1">Ingresa un saldo inicial válido</p>}
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
                  <span className="material-symbols-outlined text-[1.2rem]">key</span>
                  <span>Abrir Caja</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

interface CerrarCajaModalProps {
  openCaja: OpenCajaInfo;
  onClose: () => void;
  onSuccess: () => void;
}

const CerrarCajaModal: React.FC<CerrarCajaModalProps> = ({ openCaja, onClose, onSuccess }) => {
  const [loading, setLoading] = useState(false);
  const { register, handleSubmit, watch, formState: { errors } } = useForm({
    defaultValues: {
      saldo_cierre: openCaja.saldo_actual.toFixed(2),
    }
  });

  const saldoCierreValue = watch('saldo_cierre');
  const systemSaldo = openCaja.saldo_actual;
  const countedSaldo = Number(saldoCierreValue || 0);
  const difference = countedSaldo - systemSaldo;

  const onSubmit = async (data: any) => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('t_aperturas_caja')
        .update({
          fecha_cierre: new Date().toISOString().split('T')[0],
          saldo_cierre: Number(data.saldo_cierre)
        })
        .eq('id', openCaja.apertura_caja_id);

      if (error) throw error;

      toast.success('Caja cerrada correctamente');
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Error closing box:', err);
      toast.error('Error al cerrar caja: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300">
      <div className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl border border-white/20 flex flex-col overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-12 duration-500">
        <div className="px-10 py-8 border-b border-outline-variant/10 flex justify-between items-center bg-slate-50">
          <div>
            <h3 className="text-2xl font-headline font-extrabold text-on-surface tracking-tight">Cierre de Caja</h3>
            <p className="text-[10px] font-black text-outline uppercase tracking-widest mt-1">Arqueo físico de fondos</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-error/10 text-on-surface-variant hover:text-error rounded-full transition-all">
            <span className="material-symbols-outlined text-2xl">close</span>
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="p-10 space-y-6">
          <div className="bg-slate-50 p-6 rounded-2xl border border-outline-variant/10 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">Saldo del Sistema:</span>
              <span className="text-sm font-black text-on-surface">
                ${systemSaldo.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">Saldo Contado:</span>
              <span className="text-sm font-black text-primary">
                ${countedSaldo.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div className="pt-2 border-t border-outline-variant/5 flex justify-between items-center">
              <span className="text-xs font-black uppercase tracking-widest text-on-surface">Diferencia:</span>
              <span className={`text-sm font-black ${difference > 0.005 ? 'text-emerald-600' : difference < -0.005 ? 'text-error' : 'text-on-surface-variant'}`}>
                {difference > 0.005 ? `+ $${difference.toLocaleString('es-AR', { minimumFractionDigits: 2 })} (Sobrante)` : 
                 difference < -0.005 ? `- $${Math.abs(difference).toLocaleString('es-AR', { minimumFractionDigits: 2 })} (Faltante)` : 
                 'Sin diferencia'}
              </span>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">Monto Físico Contado ($)</label>
            <input 
              type="number" step="0.01" autoFocus
              {...register('saldo_cierre', { required: true, min: 0 })}
              className="w-full bg-surface-container-low border-none rounded-2xl py-4 px-6 text-2xl font-black text-primary focus:ring-2 focus:ring-primary/20 transition-all shadow-inner"
            />
            {errors.saldo_cierre && <p className="text-[10px] text-error font-bold mt-1 ml-1">Ingresa un monto de cierre válido</p>}
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
              className="flex-[2] py-4 bg-slate-900 text-white font-bold rounded-2xl shadow-xl shadow-slate-900/20 hover:bg-primary transition-all active:scale-95 flex items-center justify-center gap-2 text-[10px] uppercase tracking-widest"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[1.2rem]">lock</span>
                  <span>Confirmar Cierre</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

interface RegistrarEgresoModalProps {
  openCajaId: string;
  onClose: () => void;
  onSuccess: () => void;
}

const RegistrarEgresoModal: React.FC<RegistrarEgresoModalProps> = ({ openCajaId, onClose, onSuccess }) => {
  const [loading, setLoading] = useState(false);
  const { user } = useAuthStore();
  const { register, handleSubmit, formState: { errors } } = useForm({
    defaultValues: {
      monto: '',
      metodo: 'Efectivo',
      descripcion: '',
    }
  });

  const onSubmit = async (data: any) => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('t_movimientos_caja')
        .insert([{
          apertura_caja_id: openCajaId,
          tipo: 'egreso',
          metodo: data.metodo,
          monto: Number(data.monto),
          descripcion: data.descripcion,
          usuario_id: user?.id || null
        }]);

      if (error) throw error;

      toast.success('Egreso registrado correctamente');
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Error creating expense:', err);
      toast.error('Error al registrar egreso: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300">
      <div className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl border border-white/20 flex flex-col overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-12 duration-500">
        <div className="px-10 py-8 border-b border-outline-variant/10 flex justify-between items-center bg-error/5">
          <div>
            <h3 className="text-2xl font-headline font-extrabold text-on-surface tracking-tight">Registrar Egreso</h3>
            <p className="text-[10px] font-black text-error uppercase tracking-widest mt-1">Salida manual de efectivo / fondos</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-error/10 text-on-surface-variant hover:text-error rounded-full transition-all">
            <span className="material-symbols-outlined text-2xl">close</span>
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="p-10 space-y-6">
          <div className="space-y-1">
            <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">Monto a Retirar ($)</label>
            <input 
              type="number" step="0.01" autoFocus
              {...register('monto', { required: true, min: 0.01 })}
              placeholder="0.00"
              className="w-full bg-surface-container-low border-none rounded-2xl py-4 px-6 text-2xl font-black text-error focus:ring-2 focus:ring-error/20 transition-all shadow-inner"
            />
            {errors.monto && <p className="text-[10px] text-error font-bold mt-1 ml-1">Ingresa un monto válido</p>}
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">Medio de Pago / Retiro</label>
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

          <div className="space-y-1">
            <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">Detalle / Justificación</label>
            <textarea 
              {...register('descripcion', { required: true })}
              rows={2}
              className="w-full bg-surface-container-low border-none rounded-2xl py-3 px-4 text-sm font-bold focus:ring-2 focus:ring-primary/20 resize-none"
              placeholder="Ej: Pago de flete, compra de papelería, retiro para depósito bancario..."
            />
            {errors.descripcion && <p className="text-[10px] text-error font-bold mt-1 ml-1">La justificación es requerida</p>}
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
              className="flex-[2] py-4 bg-error text-white font-bold rounded-2xl shadow-xl shadow-error/20 hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-2 text-[10px] uppercase tracking-widest"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[1.2rem]">trending_down</span>
                  <span>Confirmar Egreso</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Main Component
const CashRegisterPage: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [openCaja, setOpenCaja] = useState<OpenCajaInfo | null>(null);
  const [movimientos, setMovimientos] = useState<MovimientoCaja[]>([]);

  // Modal open states
  const [isOpeningOpen, setIsOpeningOpen] = useState(false);
  const [isClosingOpen, setIsClosingOpen] = useState(false);
  const [isEgresoOpen, setIsEgresoOpen] = useState(false);

  const fetchCajaData = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Check open caja through v_saldo_caja_actual
      const { data, error } = await supabase
        .from('v_saldo_caja_actual')
        .select('*')
        .maybeSingle();

      if (error) throw error;
      setOpenCaja(data);

      if (data) {
        // 2. Fetch movements of the active caja
        const { data: movData, error: movError } = await supabase
          .from('t_movimientos_caja')
          .select(`
            id,
            apertura_caja_id,
            tipo,
            metodo,
            monto,
            descripcion,
            recibo_id,
            created_at,
            t_recibos (
              numero
            )
          `)
          .eq('apertura_caja_id', data.apertura_caja_id)
          .order('created_at', { ascending: false });

        if (movError) throw movError;
        setMovimientos(movData || []);
      } else {
        setMovimientos([]);
      }
    } catch (err: any) {
      console.error('Error fetching cash register data:', err);
      toast.error('Error al cargar caja: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCajaData();
  }, [fetchCajaData]);

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in duration-700">
      
      {/* Box status card */}
      {loading ? (
        <div className="h-64 flex flex-col items-center justify-center space-y-4 text-primary/30">
          <div className="w-10 h-10 border-4 border-primary/10 border-t-primary rounded-full animate-spin"></div>
          <p className="text-[10px] font-black uppercase tracking-widest">Sincronizando Caja Registradora...</p>
        </div>
      ) : openCaja ? (
        // Open Box View
        <div className="space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            
            {/* Saldo Inicial */}
            <div className="bg-surface-container-lowest p-8 rounded-[2rem] border border-outline-variant/10 shadow-sm flex flex-col justify-between group hover:border-slate-500/20 transition-all">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 rounded-2xl bg-slate-500/10 flex items-center justify-center text-slate-600 group-hover:bg-slate-500 group-hover:text-white transition-all">
                  <span className="material-symbols-outlined">payments</span>
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Saldo Inicial</p>
                  <h3 className="text-2xl font-headline font-extrabold text-on-surface">
                    ${Number(openCaja.saldo_inicio).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                  </h3>
                </div>
              </div>
              <p className="text-[10px] font-bold text-outline uppercase tracking-wider">Monto de apertura en caja</p>
            </div>

            {/* Total Ingresos */}
            <div className="bg-surface-container-lowest p-8 rounded-[2rem] border border-outline-variant/10 shadow-sm flex flex-col justify-between group hover:border-emerald-500/20 transition-all">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-600 group-hover:bg-emerald-500 group-hover:text-white transition-all">
                  <span className="material-symbols-outlined">trending_up</span>
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Total Ingresos</p>
                  <h3 className="text-2xl font-headline font-extrabold text-emerald-600">
                    +${Number(openCaja.total_ingresos).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                  </h3>
                </div>
              </div>
              <p className="text-[10px] font-bold text-outline uppercase tracking-wider">Pagos y cobros recibidos</p>
            </div>

            {/* Total Egresos */}
            <div className="bg-surface-container-lowest p-8 rounded-[2rem] border border-outline-variant/10 shadow-sm flex flex-col justify-between group hover:border-error/20 transition-all">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 rounded-2xl bg-error/10 flex items-center justify-center text-error group-hover:bg-error group-hover:text-white transition-all">
                  <span className="material-symbols-outlined">trending_down</span>
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Total Egresos</p>
                  <h3 className="text-2xl font-headline font-extrabold text-error">
                    -${Number(openCaja.total_egresos).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                  </h3>
                </div>
              </div>
              <p className="text-[10px] font-bold text-outline uppercase tracking-wider">Retiros y salidas de caja</p>
            </div>

            {/* Saldo Actual / Caja Abierta */}
            <div className="bg-gradient-to-br from-emerald-700 to-emerald-900 p-8 rounded-[2rem] shadow-xl flex flex-col justify-between text-white group relative overflow-hidden">
              <div className="absolute top-4 right-4 bg-white/20 text-white rounded-full px-3 py-1 text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5 backdrop-blur-sm animate-pulse">
                <span className="w-1.5 h-1.5 bg-green-400 rounded-full"></span>
                Caja Abierta
              </div>
              <div className="space-y-1 mt-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-emerald-200">Saldo Actual en Caja</p>
                <h3 className="text-3xl font-headline font-extrabold tracking-tight">
                  ${Number(openCaja.saldo_actual).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                </h3>
              </div>
              <p className="text-[9px] font-bold text-emerald-100 uppercase tracking-widest mt-4">Arqueo esperado en sistema</p>
            </div>
          </div>

          {/* Quick Actions Panel */}
          <div className="flex flex-wrap gap-4 items-center bg-white p-6 rounded-[2rem] border border-outline-variant/10 shadow-sm justify-between">
            <div className="flex flex-col">
              <h4 className="text-sm font-headline font-extrabold text-on-surface leading-tight">Operaciones de Caja</h4>
              <p className="text-[10px] text-outline font-bold uppercase tracking-wider mt-0.5">Control manual e ingresos/egresos directos</p>
            </div>
            
            <div className="flex gap-4">
              <button 
                onClick={() => setIsEgresoOpen(true)}
                className="flex items-center gap-2 px-6 py-3.5 bg-error text-white font-bold rounded-2xl text-[10px] uppercase tracking-widest hover:brightness-110 active:scale-95 transition-all shadow-lg shadow-error/15"
              >
                <span className="material-symbols-outlined text-lg">trending_down</span>
                Registrar Egreso
              </button>
              
              <button 
                onClick={() => setIsClosingOpen(true)}
                className="flex items-center gap-2 px-6 py-3.5 bg-slate-900 text-white font-bold rounded-2xl text-[10px] uppercase tracking-widest hover:bg-primary transition-all active:scale-95 shadow-lg shadow-slate-900/10"
              >
                <span className="material-symbols-outlined text-lg">lock_open</span>
                Arqueo & Cerrar Caja
              </button>
            </div>
          </div>

          {/* Movements list */}
          <div className="bg-surface-container-lowest rounded-[2.5rem] shadow-sm border border-outline-variant/10 overflow-hidden">
            <div className="p-8 border-b border-outline-variant/5 flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-headline font-extrabold text-on-surface tracking-tight">Historial de Movimientos</h2>
                <p className="text-[10px] text-outline font-bold uppercase tracking-wider mt-0.5">Registros ingresados en la apertura actual</p>
              </div>
            </div>

            <div className="overflow-x-auto no-scrollbar">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-surface-container-low/30">
                    <th className="px-8 py-5 text-[10px] font-black text-on-surface-variant uppercase tracking-widest">Fecha/Hora</th>
                    <th className="px-6 py-5 text-[10px] font-black text-on-surface-variant uppercase tracking-widest">Tipo</th>
                    <th className="px-6 py-5 text-[10px] font-black text-on-surface-variant uppercase tracking-widest">Método</th>
                    <th className="px-6 py-5 text-[10px] font-black text-on-surface-variant uppercase tracking-widest">Detalle</th>
                    <th className="px-8 py-5 text-[10px] font-black text-on-surface-variant uppercase tracking-widest text-right">Monto</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/5">
                  {movimientos.map((mov, i) => (
                    <tr key={mov.id} className="hover:bg-surface-container-high transition-colors group animate-in fade-in slide-in-from-right-4 duration-300" style={{ animationDelay: `${i * 30}ms` }}>
                      <td className="px-8 py-5 text-sm font-bold text-on-surface">
                        {new Date(mov.created_at).toLocaleString('es-AR')}
                      </td>
                      <td className="px-6 py-5">
                        <span className={`px-2.5 py-1 text-[9px] font-black uppercase rounded-lg tracking-widest w-fit border ${
                          mov.tipo === 'ingreso' 
                            ? 'bg-emerald-50 text-emerald-600 border-emerald-100' 
                            : 'bg-error/5 text-error border-error/10'
                        }`}>
                          {mov.tipo}
                        </span>
                      </td>
                      <td className="px-6 py-5 text-sm font-bold text-secondary">{mov.metodo}</td>
                      <td className="px-6 py-5">
                        <p className="text-sm font-bold text-on-surface leading-snug">{mov.descripcion}</p>
                        {(() => {
                          const receipt = Array.isArray(mov.t_recibos) ? mov.t_recibos[0] : mov.t_recibos;
                          return receipt?.numero ? (
                            <span className="text-[9px] font-black text-primary bg-primary/5 px-2 py-0.5 rounded mt-1 inline-block">
                              Asociado a Recibo {receipt.numero}
                            </span>
                          ) : null;
                        })()}
                      </td>
                      <td className="px-8 py-5 text-right font-black text-sm">
                        <span className={mov.tipo === 'ingreso' ? 'text-emerald-600' : 'text-error'}>
                          {mov.tipo === 'ingreso' ? '+' : '-'}${Number(mov.monto).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {movimientos.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-20 text-center text-outline/40 italic text-sm">
                        Aún no se han registrado movimientos en este turno de caja
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        // Closed Box View
        <div className="flex flex-col items-center justify-center py-20 px-8 bg-surface-container-lowest rounded-[3rem] border border-outline-variant/10 shadow-sm max-w-2xl mx-auto space-y-6 animate-in zoom-in-95 duration-500">
          <div className="w-24 h-24 bg-error/10 rounded-[2rem] flex items-center justify-center text-error border border-error/20">
            <span className="material-symbols-outlined text-5xl">lock</span>
          </div>
          
          <div className="text-center space-y-2 max-w-md">
            <h3 className="text-2xl font-headline font-extrabold text-on-surface tracking-tight">Caja Actualmente Cerrada</h3>
            <p className="text-sm text-on-surface-variant font-bold leading-normal">
              Para poder ingresar cobros, registrar gastos, o realizar arqueos físicos, es necesario iniciar un nuevo turno de caja.
            </p>
          </div>

          <div className="flex gap-4">
            <button 
              disabled={true}
              title="Abrí la caja primero"
              className="flex items-center gap-2 px-6 py-3.5 bg-slate-100 text-slate-400 font-bold rounded-2xl text-[10px] uppercase tracking-widest border border-slate-200 cursor-not-allowed opacity-50"
            >
              <span className="material-symbols-outlined text-lg">trending_down</span>
              Registrar Egreso
            </button>
            <button 
              onClick={() => setIsOpeningOpen(true)}
              className="flex items-center gap-2 px-8 py-3.5 bg-indigo-600 text-white font-bold rounded-2xl text-[10px] uppercase tracking-widest shadow-xl shadow-indigo-500/25 hover:brightness-110 active:scale-95 transition-all"
            >
              <span className="material-symbols-outlined text-lg">key</span>
              Abrir Turno de Caja
            </button>
          </div>
        </div>
      )}

      {/* Modals render */}
      {isOpeningOpen && (
        <AbrirCajaModal 
          onClose={() => setIsOpeningOpen(false)}
          onSuccess={fetchCajaData}
        />
      )}

      {isClosingOpen && openCaja && (
        <CerrarCajaModal 
          openCaja={openCaja}
          onClose={() => setIsClosingOpen(false)}
          onSuccess={fetchCajaData}
        />
      )}

      {isEgresoOpen && openCaja && (
        <RegistrarEgresoModal 
          openCajaId={openCaja.apertura_caja_id}
          onClose={() => setIsEgresoOpen(false)}
          onSuccess={fetchCajaData}
        />
      )}

    </div>
  );
};

export default CashRegisterPage;
