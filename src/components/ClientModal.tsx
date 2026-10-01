import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { toast } from 'react-hot-toast';
import { useForm } from 'react-hook-form';

interface ClientModalProps {
  clientId?: string;
  /** Alta rápida desde otra pantalla: pre-carga la razón social con lo que el usuario ya había tipeado. */
  initialNombre?: string;
  onClose: () => void;
  /** En un alta, recibe el cliente creado (para poder seleccionarlo automáticamente). */
  onSuccess: (created?: { id: string; razon_social: string }) => void;
}

const SITUACIONES_IVA = [
  'Responsable Inscripto',
  'Monotributista',
  'Consumidor Final',
  'Exento',
  'Sujeto no Categorizado'
];

interface IdentidadImagen {
  id: string;
  imagen_url: string;
  descripcion: string | null;
  tipo: 'logo' | 'trabajo';
}

const LIMITES_IDENTIDAD: Record<'logo' | 'trabajo', number> = { logo: 3, trabajo: 2 };

const ClientModal: React.FC<ClientModalProps> = ({ clientId, initialNombre, onClose, onSuccess }) => {
  const { register, handleSubmit, reset, formState: { errors } } = useForm<Record<string, any>>({
    defaultValues: initialNombre ? { razon_social: initialNombre.trim() } : undefined,
  });
  const [loading, setLoading] = useState(false);
  const [rubros, setRubros] = useState<{ id: string; nombre: string }[]>([]);
  const [identidadImagenes, setIdentidadImagenes] = useState<IdentidadImagen[]>([]);
  const [uploadingTipo, setUploadingTipo] = useState<'logo' | 'trabajo' | null>(null);

  // Fetch rubros de cliente para el dropdown
  useEffect(() => {
    const fetchRubros = async () => {
      const { data, error } = await supabase.from('t_conf_rubros_cliente').select('id, nombre').order('nombre');
      if (error) {
        toast.error('Error al cargar rubros: ' + error.message);
        return;
      }
      setRubros(data || []);
    };
    fetchRubros();
  }, []);

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

  const fetchIdentidadImagenes = async (id: string) => {
    const { data, error } = await supabase
      .from('t_identidad_visual_cliente')
      .select('id, imagen_url, descripcion, tipo')
      .eq('cliente_id', id)
      .order('created_at', { ascending: true });
    if (error) {
      toast.error('Error al cargar imágenes de identidad visual: ' + error.message);
      return;
    }
    setIdentidadImagenes((data || []) as IdentidadImagen[]);
  };

  useEffect(() => {
    if (clientId) {
      fetchIdentidadImagenes(clientId);
    } else {
      setIdentidadImagenes([]);
    }
  }, [clientId]);

  const handleUploadImagen = async (tipo: 'logo' | 'trabajo', file: File) => {
    if (!clientId) return;
    setUploadingTipo(tipo);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 11)}.${fileExt}`;
      const filePath = `identidad-clientes/${clientId}/${fileName}`;

      const { error: uploadError } = await supabase.storage.from('marketing').upload(filePath, file);
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage.from('marketing').getPublicUrl(filePath);

      const { error: insertError } = await supabase.from('t_identidad_visual_cliente').insert({
        cliente_id: clientId,
        imagen_url: publicUrl,
        descripcion: file.name,
        tipo,
      });
      if (insertError) throw insertError;

      toast.success('Imagen subida correctamente');
      await fetchIdentidadImagenes(clientId);
    } catch (err: any) {
      toast.error(err.message || 'Error al subir la imagen');
    } finally {
      setUploadingTipo(null);
    }
  };

  const handleDeleteImagen = async (img: IdentidadImagen) => {
    if (!confirm('¿Eliminar esta imagen?')) return;
    try {
      const { error } = await supabase.from('t_identidad_visual_cliente').delete().eq('id', img.id);
      if (error) throw error;
      try {
        const urlObj = new URL(img.imagen_url);
        const pathParts = urlObj.pathname.split('/marketing/');
        if (pathParts.length > 1) {
          await supabase.storage.from('marketing').remove([decodeURIComponent(pathParts[1])]);
        }
      } catch {
        // si falla borrar del storage, la fila ya se borró; no es crítico
      }
      setIdentidadImagenes((prev) => prev.filter((i) => i.id !== img.id));
      toast.success('Imagen eliminada');
    } catch (err: any) {
      toast.error(err.message || 'Error al eliminar la imagen');
    }
  };

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
        const { data: created, error } = await supabase
          .from('t_clientes')
          .insert([{
            ...sanitizedData,
            created_at: new Date().toISOString(),
          }])
          .select('id, razon_social')
          .single();

        if (error) throw error;
        toast.success('Cliente registrado correctamente');
        onSuccess(created ?? undefined);
        onClose();
        return;
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
                <select
                  {...register('rubro_id')}
                  className="w-full bg-surface-container-low border-none rounded-2xl py-3.5 px-4 text-sm font-bold focus:ring-2 focus:ring-primary/20 appearance-none cursor-pointer"
                >
                  <option value="">Seleccionar...</option>
                  {rubros.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
                </select>
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

          <hr className="border-outline-variant/10" />

          {/* Section: Identidad Visual */}
          <div className="space-y-6">
            <div className="flex items-center gap-3 text-primary">
              <span className="material-symbols-outlined font-bold">photo_library</span>
              <h4 className="text-sm font-black uppercase tracking-[0.2em]">Identidad Visual</h4>
            </div>
            <p className="text-[11px] text-on-surface-variant font-medium -mt-2">
              Logos y ejemplos de trabajos/publicidades ya hechas, para trabajar después la identidad visual de este cliente.
            </p>

            {!clientId ? (
              <p className="text-xs font-bold text-on-surface-variant bg-surface-container-low/40 rounded-2xl p-5">
                Guardá el cliente primero para poder subir sus imágenes de identidad visual.
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {(['logo', 'trabajo'] as const).map((tipo) => {
                  const imgs = identidadImagenes.filter((i) => i.tipo === tipo);
                  const max = LIMITES_IDENTIDAD[tipo];
                  const puedeAgregar = imgs.length < max;
                  return (
                    <div key={tipo} className="space-y-2">
                      <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">
                        {tipo === 'logo' ? 'Logos' : 'Trabajos / Publicidades'} ({imgs.length}/{max})
                      </label>
                      <div className="grid grid-cols-3 gap-2">
                        {imgs.map((img) => (
                          <div
                            key={img.id}
                            className="relative aspect-square rounded-xl overflow-hidden border border-outline-variant/20 group bg-surface-container-low"
                          >
                            <img src={img.imagen_url} alt={img.descripcion || tipo} className="w-full h-full object-cover" />
                            <button
                              type="button"
                              onClick={() => handleDeleteImagen(img)}
                              title="Eliminar"
                              className="absolute top-1 right-1 w-6 h-6 flex items-center justify-center bg-black/60 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <span className="material-symbols-outlined text-sm">close</span>
                            </button>
                          </div>
                        ))}
                        {puedeAgregar && (
                          <label
                            className={`aspect-square rounded-xl border-2 border-dashed border-outline-variant/30 flex flex-col items-center justify-center cursor-pointer hover:border-primary/40 hover:bg-primary/5 transition-all ${
                              uploadingTipo === tipo ? 'opacity-50 pointer-events-none' : ''
                            }`}
                          >
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) handleUploadImagen(tipo, file);
                                e.target.value = '';
                              }}
                            />
                            {uploadingTipo === tipo ? (
                              <div className="w-5 h-5 border-2 border-primary/20 border-t-primary rounded-full animate-spin"></div>
                            ) : (
                              <span className="material-symbols-outlined text-2xl text-outline/50">add_photo_alternate</span>
                            )}
                          </label>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
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
