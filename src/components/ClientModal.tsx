import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { toast } from 'react-hot-toast';
import { useForm } from 'react-hook-form';

interface ClientModalProps {
  clientId?: string;
  onClose: () => void;
  onSuccess: () => void;
}

const SITUACIONES_IVA = [
  'Responsable Inscripto',
  'Monotributista',
  'Consumidor Final',
  'Exento',
  'Sujeto no Categorizado'
];

const ClientModal: React.FC<ClientModalProps> = ({ clientId, onClose, onSuccess }) => {
  const { register, handleSubmit, watch, reset, formState: { errors } } = useForm();
  const [loading, setLoading] = useState(false);

  const esMayorista = watch('es_mayorista');

  // Fetch client data if editing
  useEffect(() => {
    if (clientId) {
      const fetchClient = async () => {
        setLoading(true);
        try {
          const { data, error } = await supabase
            .from('t_clientes')
            .select('*')
            .eq('id', clientId)
            .single();

          if (error) throw error;
          if (data) {
            reset(data);
          }
        } catch (err: any) {
          toast.error('Error al cargar datos del cliente: ' + err.message);
        } finally {
          setLoading(false);
        }
      };
      fetchClient();
    }
  }, [clientId, reset]);

  const onSubmit = async (data: any) => {
    setLoading(true);
    try {
      // Clean up empty strings to null (especially for dates and optional fields)
      const sanitizedData = Object.entries(data).reduce((acc: any, [key, value]) => {
        acc[key] = value === "" ? null : value;
        return acc;
      }, {});

      if (clientId) {
        // UPDATE MODE
        const { error } = await supabase
          .from('t_clientes')
          .update(sanitizedData)
          .eq('id', clientId);

        if (error) throw error;
        toast.success('Cliente actualizado correctamente');
      } else {
        // INSERT MODE
        const { error } = await supabase
          .from('t_clientes')
          .insert([{
            ...sanitizedData,
            created_at: new Date().toISOString(),
          }]);

        if (error) throw error;
        toast.success('Cliente registrado correctamente');
      }
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Supabase Error:', err);
      toast.error('Error al registrar cliente: ' + (err.message || 'Error de validación'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300">
      <div className="bg-white w-full max-w-4xl max-h-[90vh] rounded-[2.5rem] shadow-2xl border border-white/20 flex flex-col overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-12 duration-500">
        {/* Header */}
        <div className="px-10 py-8 border-b border-outline-variant/10 flex justify-between items-center bg-surface-container-low/30">
          <div>
            <h3 className="text-3xl font-headline font-extrabold text-on-surface tracking-tight">
              {clientId ? 'Editar Cliente' : 'Nuevo Cliente'}
            </h3>
            <p className="text-xs text-on-surface-variant font-bold uppercase tracking-widest mt-1">
              {clientId ? 'Actualizar información del socio comercial' : 'Registro de socio comercial / entidad fiscal'}
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-error/10 text-on-surface-variant hover:text-error rounded-full transition-all transition-transform active:scale-90">
            <span className="material-symbols-outlined text-3xl">close</span>
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit(onSubmit)} className="flex-1 overflow-y-auto no-scrollbar p-10 space-y-12">
          
          {/* Section: Fiscal Identity */}
          <div className="space-y-6">
            <div className="flex items-center gap-3 text-primary">
              <span className="material-symbols-outlined font-bold">badge</span>
              <h4 className="text-sm font-black uppercase tracking-[0.2em]">Identidad Fiscal</h4>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">Razón Social</label>
                <input 
                  {...register('razon_social', { required: true })}
                  placeholder="Ej: Imprenta S.A."
                  className="w-full bg-surface-container-low border-none rounded-2xl py-3.5 px-4 text-sm font-bold focus:ring-2 focus:ring-primary/20"
                />
                {errors.razon_social && <p className="text-[10px] text-error font-bold mt-1 ml-1">Requerido</p>}
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">Nombre Fantasía</label>
                <input 
                  {...register('nombre_fantasia')}
                  placeholder="Ej: Grafiko Center"
                  className="w-full bg-surface-container-low border-none rounded-2xl py-3.5 px-4 text-sm font-bold focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">CUIT</label>
                <input 
                  {...register('cuit')}
                  placeholder="30-XXXXXXXX-X"
                  className="w-full bg-surface-container-low border-none rounded-2xl py-3.5 px-4 text-sm font-bold focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">Situación IVA</label>
                <select 
                  {...register('situacion_iva')}
                  className="w-full bg-surface-container-low border-none rounded-2xl py-3.5 px-4 text-sm font-bold focus:ring-2 focus:ring-primary/20 appearance-none cursor-pointer"
                >
                  <option value="Ninguno">Seleccionar...</option>
                  {SITUACIONES_IVA.map(diva => <option key={diva} value={diva}>{diva}</option>)}
                </select>
              </div>
              <div className="space-y-1 flex items-end pb-3">
                <label className="flex items-center gap-3 cursor-pointer group px-4 py-2 bg-surface-container-low rounded-2xl w-full hover:bg-primary/5 transition-colors">
                  <div className={`w-10 h-6 rounded-full transition-all relative ${esMayorista ? 'bg-primary' : 'bg-outline-variant/30'}`}>
                    <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${esMayorista ? 'left-5' : 'left-1'}`}></div>
                  </div>
                  <input 
                    type="checkbox" className="hidden"
                    {...register('es_mayorista')}
                  />
                  <span className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest">Cliente Mayorista</span>
                </label>
              </div>
            </div>
          </div>

          <hr className="border-outline-variant/10" />

          {/* Section: Contact & Location */}
          <div className="space-y-6">
            <div className="flex items-center gap-3 text-primary">
              <span className="material-symbols-outlined font-bold">alternate_email</span>
              <h4 className="text-sm font-black uppercase tracking-[0.2em]">Contacto y Ubicación</h4>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-1 text-sm">
                <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">Email</label>
                <input 
                  type="email"
                  {...register('email')}
                  placeholder="cliente@ejemplo.com"
                  className="w-full bg-surface-container-low border-none rounded-2xl py-3.5 px-4 text-sm font-bold focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">Teléfonos</label>
                <input 
                  {...register('telefonos')}
                  placeholder="+54 11 ..."
                  className="w-full bg-surface-container-low border-none rounded-2xl py-3.5 px-4 text-sm font-bold focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">Dirección</label>
                <input 
                  {...register('direccion')}
                  placeholder="Calle 123..."
                  className="w-full bg-surface-container-low border-none rounded-2xl py-3.5 px-4 text-sm font-bold focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">Localidad</label>
                <input 
                  {...register('localidad')}
                  placeholder="Ciudad..."
                  className="w-full bg-surface-container-low border-none rounded-2xl py-3.5 px-4 text-sm font-bold focus:ring-2 focus:ring-primary/20"
                />
              </div>
            </div>
          </div>

          <hr className="border-outline-variant/10" />

          {/* Section: Professional Details */}
          <div className="space-y-6">
            <div className="flex items-center gap-3 text-primary">
              <span className="material-symbols-outlined font-bold">domain</span>
              <h4 className="text-sm font-black uppercase tracking-[0.2em]">Detalles Especializados</h4>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">IIBB</label>
                <input {...register('nro_iibb')} className="w-full bg-surface-container-low border-none rounded-2xl py-3.5 px-4 text-sm font-bold focus:ring-2 focus:ring-primary/20" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">Inicio Actividad</label>
                <input type="date" {...register('inicio_actividad')} className="w-full bg-surface-container-low border-none rounded-2xl py-3.5 px-4 text-sm font-bold focus:ring-2 focus:ring-primary/20" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">Rubro</label>
                <input {...register('rubro')} className="w-full bg-surface-container-low border-none rounded-2xl py-3.5 px-4 text-sm font-bold focus:ring-2 focus:ring-primary/20" />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">Observaciones</label>
              <textarea 
                {...register('observaciones')}
                rows={3}
                className="w-full bg-surface-container-low border-none rounded-3xl py-4 px-6 text-sm font-bold focus:ring-2 focus:ring-primary/20 resize-none"
                placeholder="Notas adicionales sobre el cliente..."
              />
            </div>
          </div>
        </form>

        {/* Footer Actions */}
        <div className="px-10 py-8 bg-surface-container-low/50 border-t border-outline-variant/10 flex gap-4">
          <button 
            type="button"
            onClick={onClose}
            className="flex-1 py-4 bg-white text-on-surface-variant font-bold rounded-2xl hover:bg-slate-100 transition-all border border-outline-variant/20 active:scale-95"
          >
            Cancelar
          </button>
          <button 
            disabled={loading}
            onClick={handleSubmit(onSubmit)}
            className="flex-[2] py-4 bg-primary text-white font-bold rounded-2xl shadow-xl shadow-primary/20 hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-2"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
            ) : (
              <>
                <span className="material-symbols-outlined">{clientId ? 'save' : 'person_add'}</span>
                <span>{clientId ? 'Guardar Cambios' : 'Registrar Cliente'}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ClientModal;
