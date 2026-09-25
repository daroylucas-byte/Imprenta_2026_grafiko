import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { toast } from 'react-hot-toast';
import { useForm } from 'react-hook-form';

interface ServicioModalProps {
  servicioId?: string;
  onClose: () => void;
  onSuccess: () => void;
}

interface ServicioFormValues {
  nombre: string;
  tipo: 'propio' | 'tercerizado';
  unidad_id: string;
  costo_unitario: number | string;
  observaciones: string;
}

interface UnidadMedida {
  id: string;
  nombre: string;
}

const ServicioModal: React.FC<ServicioModalProps> = ({ servicioId, onClose, onSuccess }) => {
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [unidades, setUnidades] = useState<UnidadMedida[]>([]);

  const isEditing = Boolean(servicioId);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ServicioFormValues>({
    defaultValues: {
      nombre: '',
      tipo: 'propio',
      unidad_id: '',
      costo_unitario: 0,
      observaciones: '',
    },
  });

  // Cargar catálogo de unidades de medida
  useEffect(() => {
    const fetchUnidades = async () => {
      try {
        const { data, error } = await supabase
          .from('t_conf_unidades_medida')
          .select('id, nombre')
          .order('created_at', { ascending: true });

        if (error) throw error;
        setUnidades(data || []);
      } catch (err: any) {
        console.error('Error fetching unidades:', err);
      }
    };

    fetchUnidades();
  }, []);

  // Cargar datos si estamos editando
  useEffect(() => {
    if (servicioId) {
      const fetchServicio = async () => {
        setFetching(true);
        try {
          const { data, error } = await supabase
            .from('t_servicios')
            .select('*')
            .eq('id', servicioId)
            .single();

          if (error) throw error;
          if (data) {
            reset({
              nombre: data.nombre || '',
              tipo: data.tipo || 'propio',
              unidad_id: data.unidad_id || '',
              costo_unitario: data.costo_unitario ? Number(data.costo_unitario) : 0,
              observaciones: data.observaciones || '',
            });
          }
        } catch (err: any) {
          toast.error('Error al cargar datos del servicio: ' + err.message);
        } finally {
          setFetching(false);
        }
      };

      fetchServicio();
    }
  }, [servicioId, reset]);

  const onSubmit = async (formData: ServicioFormValues) => {
    const nombreTrimmed = formData.nombre?.trim();
    if (!nombreTrimmed) {
      toast.error('El nombre del servicio es obligatorio');
      return;
    }

    const costoNum = Math.max(0, Number(formData.costo_unitario) || 0);

    const payload: Record<string, any> = {
      nombre: nombreTrimmed,
      tipo: formData.tipo || 'propio',
      unidad_id: formData.unidad_id || null,
      costo_unitario: costoNum,
      observaciones: formData.observaciones?.trim() || null,
    };

    setLoading(true);
    try {
      if (isEditing) {
        const { error } = await supabase
          .from('t_servicios')
          .update(payload)
          .eq('id', servicioId);

        if (error) throw error;
        toast.success('Servicio actualizado correctamente');
      } else {
        const { error } = await supabase
          .from('t_servicios')
          .insert([payload]);

        if (error) throw error;
        toast.success('Servicio registrado correctamente');
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Error saving servicio:', err);
      toast.error('Error al guardar servicio: ' + (err.message || 'Error inesperado'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300">
      <div className="bg-white w-full max-w-xl rounded-[2.5rem] shadow-2xl border border-white/20 flex flex-col overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-12 duration-500">
        {/* Header */}
        <div className="px-10 py-8 border-b border-outline-variant/10 flex justify-between items-center bg-surface-container-low/30 shrink-0">
          <div>
            <h3 className="text-2xl font-headline font-extrabold text-on-surface tracking-tight">
              {isEditing ? 'Editar Servicio' : 'Nuevo Servicio'}
            </h3>
            <p className="text-xs text-on-surface-variant font-bold uppercase tracking-widest mt-1">
              {isEditing
                ? 'Modificar tarifa y parámetros de costeo'
                : 'Alta de tarea del taller o servicio tercerizado'}
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
        {fetching ? (
          <div className="flex-1 flex flex-col items-center justify-center py-20 space-y-4 text-primary/40">
            <div className="w-10 h-10 border-4 border-primary/10 border-t-primary rounded-full animate-spin"></div>
            <p className="text-xs font-black uppercase tracking-widest text-outline">Cargando servicio...</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="flex-1 overflow-y-auto no-scrollbar p-8 sm:p-10 space-y-6">
            {/* Nombre */}
            <div className="space-y-1">
              <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">
                Nombre del Servicio <span className="text-error">*</span>
              </label>
              <input
                {...register('nombre', { required: 'El nombre es obligatorio' })}
                placeholder="Ej: Diseño Gráfico, Troquelado, Encuadernación..."
                autoFocus={!isEditing}
                className="w-full bg-surface-container-low border-none rounded-2xl py-3 px-4 text-sm font-bold focus:ring-2 focus:ring-primary/20 shadow-inner"
              />
              {errors.nombre && (
                <p className="text-[10px] text-error font-bold mt-1 ml-1">{errors.nombre.message}</p>
              )}
            </div>

            {/* Tipo de Servicio */}
            <div className="space-y-1">
              <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">
                Tipo de Servicio
              </label>
              <select
                {...register('tipo', { required: true })}
                className="w-full bg-surface-container-low border-none rounded-2xl py-3 px-4 text-sm font-bold focus:ring-2 focus:ring-primary/20 appearance-none cursor-pointer"
              >
                <option value="propio">Propio (taller interno)</option>
                <option value="tercerizado">Tercerizado (proveedor externo)</option>
              </select>
              <p className="text-[10px] text-outline font-medium mt-1 ml-1">
                Los propios representan mano de obra o máquinas del taller; los tercerizados son trabajos externos.
              </p>
            </div>

            {/* Unidad de Medida y Costo Unitario */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">
                  Unidad de Medida
                </label>
                <select
                  {...register('unidad_id')}
                  className="w-full bg-surface-container-low border-none rounded-2xl py-3 px-4 text-sm font-bold focus:ring-2 focus:ring-primary/20 appearance-none cursor-pointer"
                >
                  <option value="">Sin unidad</option>
                  {unidades.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.nombre}
                    </option>
                  ))}
                </select>
                <p className="text-[9px] text-outline font-medium mt-1 ml-1">
                  Ej: Hora, Unidad, Millares. Se gestionan en Configuración → Compras.
                </p>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">
                  Costo Unitario Base ($)
                </label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  {...register('costo_unitario')}
                  placeholder="0.00"
                  className="w-full bg-surface-container-low border-none rounded-2xl py-3 px-4 text-sm font-bold focus:ring-2 focus:ring-primary/20 shadow-inner"
                />
                <p className="text-[9px] text-outline font-medium mt-1 ml-1">
                  Costo de referencia propuesto en la calculadora.
                </p>
              </div>
            </div>

            {/* Observaciones */}
            <div className="space-y-1">
              <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">
                Observaciones / Proveedor habitual
              </label>
              <textarea
                {...register('observaciones')}
                rows={3}
                placeholder="Tiempo estimado, proveedor externo de referencia, notas..."
                className="w-full bg-surface-container-low border-none rounded-2xl py-3 px-4 text-sm font-bold focus:ring-2 focus:ring-primary/20 resize-none shadow-inner"
              />
            </div>

            {/* Footer Actions */}
            <div className="flex gap-4 pt-4 shrink-0">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-3.5 bg-white text-on-surface-variant font-bold rounded-2xl hover:bg-slate-100 transition-all border border-outline-variant/20 active:scale-95 text-xs uppercase tracking-widest"
              >
                Cancelar
              </button>
              <button
                disabled={loading || fetching}
                type="submit"
                className="flex-[2] py-3.5 bg-primary text-white font-bold rounded-2xl shadow-xl shadow-primary/20 hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-2 text-xs uppercase tracking-widest disabled:opacity-50"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-lg">{isEditing ? 'save' : 'add_circle'}</span>
                    <span>{isEditing ? 'Guardar Cambios' : 'Registrar Servicio'}</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default ServicioModal;
