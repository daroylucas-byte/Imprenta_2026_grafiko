import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { toast } from 'react-hot-toast';
import { useForm } from 'react-hook-form';

interface SupplierModalProps {
  supplierId?: string;
  onClose: () => void;
  onSuccess: () => void;
}

interface SupplierFormValues {
  nombre: string;
  razon_social: string;
  cuit: string;
  contacto: string;
  email: string;
  telefonos: string;
  direccion: string;
  localidad: string;
  observaciones: string;
  condicion_pago: 'contado' | 'cuenta_corriente';
  limite_credito: number | string;
}

const SupplierModal: React.FC<SupplierModalProps> = ({ supplierId, onClose, onSuccess }) => {
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors }
  } = useForm<SupplierFormValues>({
    defaultValues: {
      nombre: '',
      razon_social: '',
      cuit: '',
      contacto: '',
      email: '',
      telefonos: '',
      direccion: '',
      localidad: '',
      observaciones: '',
      condicion_pago: 'contado',
      limite_credito: 0,
    }
  });

  const condicionPago = watch('condicion_pago');

  // Cargar datos si estamos editando
  useEffect(() => {
    if (supplierId) {
      const fetchSupplier = async () => {
        setFetching(true);
        try {
          const { data, error } = await supabase
            .from('t_proveedores')
            .select('*')
            .eq('id', supplierId)
            .single();

          if (error) throw error;
          if (data) {
            reset({
              nombre: data.nombre || '',
              razon_social: data.razon_social || '',
              cuit: data.cuit || '',
              contacto: data.contacto || '',
              email: data.email || '',
              telefonos: data.telefonos || '',
              direccion: data.direccion || '',
              localidad: data.localidad || '',
              observaciones: data.observaciones || '',
              condicion_pago: data.condicion_pago || 'contado',
              limite_credito: data.limite_credito ?? 0,
            });
          }
        } catch (err: any) {
          toast.error('Error al cargar datos del proveedor: ' + err.message);
        } finally {
          setFetching(false);
        }
      };
      fetchSupplier();
    }
  }, [supplierId, reset]);

  const validateCuit = (val?: string) => {
    if (!val || val.trim() === '') return true;
    const clean = val.replace(/\D/g, '');
    if (clean.length !== 11) {
      return 'El CUIT debe tener 11 dígitos numéricos';
    }
    return true;
  };

  const validateEmail = (val?: string) => {
    if (!val || val.trim() === '') return true;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(val)) {
      return 'Ingresá un email válido';
    }
    return true;
  };

  const onSubmit = async (formData: SupplierFormValues) => {
    setLoading(true);
    try {
      const nombreTrimmed = formData.nombre?.trim();
      if (!nombreTrimmed) {
        toast.error('El nombre es obligatorio');
        setLoading(false);
        return;
      }

      const cleanLimiteCredito =
        formData.condicion_pago === 'cuenta_corriente'
          ? Math.max(0, Number(formData.limite_credito) || 0)
          : 0;

      const payload: Record<string, any> = {
        nombre: nombreTrimmed,
        razon_social: formData.razon_social?.trim() || null,
        cuit: formData.cuit?.trim() || null,
        contacto: formData.contacto?.trim() || null,
        email: formData.email?.trim() || null,
        telefonos: formData.telefonos?.trim() || null,
        direccion: formData.direccion?.trim() || null,
        localidad: formData.localidad?.trim() || null,
        observaciones: formData.observaciones?.trim() || null,
        condicion_pago: formData.condicion_pago || 'contado',
        limite_credito: cleanLimiteCredito,
      };

      if (supplierId) {
        const { error } = await supabase
          .from('t_proveedores')
          .update(payload)
          .eq('id', supplierId);

        if (error) throw error;
        toast.success('Proveedor actualizado correctamente');
      } else {
        const { error } = await supabase
          .from('t_proveedores')
          .insert([payload]);

        if (error) throw error;
        toast.success('Proveedor registrado correctamente');
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Supplier save error:', err);
      toast.error('Error al guardar proveedor: ' + (err.message || 'Error inesperado'));
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
              {supplierId ? 'Editar Proveedor' : 'Nuevo Proveedor'}
            </h3>
            <p className="text-xs text-on-surface-variant font-bold uppercase tracking-widest mt-1">
              {supplierId ? 'Actualizar información del proveedor' : 'Alta de proveedor de insumos y servicios'}
            </p>
          </div>
          <button
            onClick={onClose}
            title="Cerrar"
            className="p-2 hover:bg-error/10 text-on-surface-variant hover:text-error rounded-full transition-all active:scale-90"
          >
            <span className="material-symbols-outlined text-3xl">close</span>
          </button>
        </div>

        {/* Form Body */}
        {fetching ? (
          <div className="flex-1 flex flex-col items-center justify-center py-20 space-y-4 text-primary/40">
            <div className="w-10 h-10 border-4 border-primary/10 border-t-primary rounded-full animate-spin"></div>
            <p className="text-xs font-black uppercase tracking-widest text-outline">Cargando proveedor...</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="flex-1 overflow-y-auto no-scrollbar p-10 space-y-10">
            {/* Sección: Identificación Comercial */}
            <div className="space-y-6">
              <div className="flex items-center gap-3 text-primary">
                <span className="material-symbols-outlined font-bold">badge</span>
                <h4 className="text-sm font-black uppercase tracking-[0.2em]">Identificación Comercial</h4>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-1 md:col-span-1">
                  <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">
                    Nombre <span className="text-error">*</span>
                  </label>
                  <input
                    {...register('nombre', { required: 'El nombre es obligatorio' })}
                    placeholder="Ej: Distribuidora Papelera"
                    className="w-full bg-surface-container-low border-none rounded-2xl py-3.5 px-4 text-sm font-bold focus:ring-2 focus:ring-primary/20 shadow-inner"
                  />
                  {errors.nombre && <p className="text-[10px] text-error font-bold mt-1 ml-1">{errors.nombre.message}</p>}
                </div>
                <div className="space-y-1 md:col-span-1">
                  <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">
                    Razón Social
                  </label>
                  <input
                    {...register('razon_social')}
                    placeholder="Ej: Papelera del Plata S.A."
                    className="w-full bg-surface-container-low border-none rounded-2xl py-3.5 px-4 text-sm font-bold focus:ring-2 focus:ring-primary/20 shadow-inner"
                  />
                </div>
                <div className="space-y-1 md:col-span-1">
                  <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">
                    CUIT
                  </label>
                  <input
                    {...register('cuit', { validate: validateCuit })}
                    placeholder="30-XXXXXXXX-X"
                    className="w-full bg-surface-container-low border-none rounded-2xl py-3.5 px-4 text-sm font-bold focus:ring-2 focus:ring-primary/20 shadow-inner"
                  />
                  {errors.cuit && <p className="text-[10px] text-error font-bold mt-1 ml-1">{errors.cuit.message}</p>}
                </div>
              </div>
            </div>

            <hr className="border-outline-variant/10" />

            {/* Sección: Contacto y Ubicación */}
            <div className="space-y-6">
              <div className="flex items-center gap-3 text-primary">
                <span className="material-symbols-outlined font-bold">alternate_email</span>
                <h4 className="text-sm font-black uppercase tracking-[0.2em]">Contacto y Ubicación</h4>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">
                    Persona de Contacto
                  </label>
                  <input
                    {...register('contacto')}
                    placeholder="Ej: Juan Pérez (Ventas)"
                    className="w-full bg-surface-container-low border-none rounded-2xl py-3.5 px-4 text-sm font-bold focus:ring-2 focus:ring-primary/20 shadow-inner"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">
                    Teléfonos
                  </label>
                  <input
                    {...register('telefonos')}
                    placeholder="+54 11 4444-5555 / WhatsApp"
                    className="w-full bg-surface-container-low border-none rounded-2xl py-3.5 px-4 text-sm font-bold focus:ring-2 focus:ring-primary/20 shadow-inner"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">
                    Email
                  </label>
                  <input
                    type="email"
                    {...register('email', { validate: validateEmail })}
                    placeholder="ventas@proveedor.com"
                    className="w-full bg-surface-container-low border-none rounded-2xl py-3.5 px-4 text-sm font-bold focus:ring-2 focus:ring-primary/20 shadow-inner"
                  />
                  {errors.email && <p className="text-[10px] text-error font-bold mt-1 ml-1">{errors.email.message}</p>}
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">
                    Localidad
                  </label>
                  <input
                    {...register('localidad')}
                    placeholder="Ej: Morón, Buenos Aires"
                    className="w-full bg-surface-container-low border-none rounded-2xl py-3.5 px-4 text-sm font-bold focus:ring-2 focus:ring-primary/20 shadow-inner"
                  />
                </div>
                <div className="space-y-1 md:col-span-2">
                  <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">
                    Dirección
                  </label>
                  <input
                    {...register('direccion')}
                    placeholder="Calle, número, piso, depósito..."
                    className="w-full bg-surface-container-low border-none rounded-2xl py-3.5 px-4 text-sm font-bold focus:ring-2 focus:ring-primary/20 shadow-inner"
                  />
                </div>
              </div>
            </div>

            <hr className="border-outline-variant/10" />

            {/* Sección: Condiciones Comerciales */}
            <div className="space-y-6">
              <div className="flex items-center gap-3 text-primary">
                <span className="material-symbols-outlined font-bold">credit_card</span>
                <h4 className="text-sm font-black uppercase tracking-[0.2em]">Condición de Compra</h4>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">
                    Condición de Pago
                  </label>
                  <select
                    {...register('condicion_pago')}
                    className="w-full bg-surface-container-low border-none rounded-2xl py-3.5 px-4 text-sm font-bold focus:ring-2 focus:ring-primary/20 appearance-none cursor-pointer"
                  >
                    <option value="contado">Contado</option>
                    <option value="cuenta_corriente">Cuenta corriente</option>
                  </select>
                </div>

                {condicionPago === 'cuenta_corriente' && (
                  <div className="space-y-1 animate-in fade-in slide-in-from-top-2 duration-300">
                    <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">
                      Límite de Crédito ($)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      {...register('limite_credito')}
                      placeholder="0 (Sin límite definido)"
                      className="w-full bg-surface-container-low border-none rounded-2xl py-3.5 px-4 text-sm font-bold focus:ring-2 focus:ring-primary/20 shadow-inner"
                    />
                    <p className="text-[9px] text-outline font-bold mt-1 ml-1">
                      Dejá en 0 si no hay un tope prefijado para este proveedor.
                    </p>
                  </div>
                )}

                <div className="space-y-1 md:col-span-2">
                  <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">
                    Observaciones
                  </label>
                  <textarea
                    {...register('observaciones')}
                    rows={3}
                    className="w-full bg-surface-container-low border-none rounded-3xl py-4 px-6 text-sm font-bold focus:ring-2 focus:ring-primary/20 resize-none shadow-inner"
                    placeholder="Notas internas, días de entrega, horarios de atención, datos bancarios..."
                  />
                </div>
              </div>
            </div>
          </form>
        )}

        {/* Footer Actions */}
        <div className="px-10 py-8 bg-surface-container-low/50 border-t border-outline-variant/10 flex gap-4">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-4 bg-white text-on-surface-variant font-bold rounded-2xl hover:bg-slate-100 transition-all border border-outline-variant/20 active:scale-95 text-xs uppercase tracking-widest"
          >
            Cancelar
          </button>
          <button
            disabled={loading || fetching}
            onClick={handleSubmit(onSubmit)}
            className="flex-[2] py-4 bg-primary text-white font-bold rounded-2xl shadow-xl shadow-primary/20 hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-2 text-xs uppercase tracking-widest disabled:opacity-50"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
            ) : (
              <>
                <span className="material-symbols-outlined">{supplierId ? 'save' : 'add_business'}</span>
                <span>{supplierId ? 'Guardar Cambios' : 'Registrar Proveedor'}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SupplierModal;
