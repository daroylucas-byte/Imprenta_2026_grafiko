import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { toast } from 'react-hot-toast';
import { useForm } from 'react-hook-form';
import { useAuthStore } from '../store/authStore';

interface InsumoModalProps {
  insumoId?: string;
  onClose: () => void;
  onSuccess: () => void;
}

interface InsumoFormValues {
  nombre: string;
  codigo: string;
  categoria_id: string;
  unidad_stock_id: string;
  unidad_compra_id: string;
  factor_compra: number | string;
  stock_minimo: number | string;
  ultimo_costo_compra: number | string;
  observaciones: string;
  stock_inicial: number | string;
}

interface UnidadMedida {
  id: string;
  nombre: string;
}

interface CategoriaInsumo {
  id: string;
  nombre: string;
}

const InsumoModal: React.FC<InsumoModalProps> = ({ insumoId, onClose, onSuccess }) => {
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [unidades, setUnidades] = useState<UnidadMedida[]>([]);
  const [categorias, setCategorias] = useState<CategoriaInsumo[]>([]);
  const { user } = useAuthStore();

  const isEditing = Boolean(insumoId);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<InsumoFormValues>({
    defaultValues: {
      nombre: '',
      codigo: '',
      categoria_id: '',
      unidad_stock_id: '',
      unidad_compra_id: '',
      factor_compra: 1,
      stock_minimo: 0,
      ultimo_costo_compra: 0,
      observaciones: '',
      stock_inicial: 0,
    },
  });

  const selectedUnidadStockId = watch('unidad_stock_id');
  const selectedUnidadCompraId = watch('unidad_compra_id');
  const hasUnidadCompra = Boolean(selectedUnidadCompraId && selectedUnidadCompraId !== '');

  // Cargar catálogos
  useEffect(() => {
    const loadCatalogs = async () => {
      try {
        const [unidadesRes, categoriasRes] = await Promise.all([
          supabase.from('t_conf_unidades_medida').select('id, nombre').order('created_at', { ascending: true }),
          supabase.from('t_conf_categorias_insumo').select('id, nombre').order('nombre', { ascending: true }),
        ]);

        if (unidadesRes.error) throw unidadesRes.error;
        if (categoriasRes.error) throw categoriasRes.error;

        const unidadesList = unidadesRes.data || [];
        setUnidades(unidadesList);
        setCategorias(categoriasRes.data || []);

        // Si es alta y no hay unidad_stock seleccionada, setear la primera por defecto si existe
        if (!insumoId && unidadesList.length > 0) {
          setValue('unidad_stock_id', unidadesList[0].id);
        }
      } catch (err: any) {
        toast.error('Error al cargar listas de configuración: ' + err.message);
      }
    };

    loadCatalogs();
  }, [insumoId, setValue]);

  // Cargar datos si estamos editando
  useEffect(() => {
    if (insumoId) {
      const fetchInsumo = async () => {
        setFetching(true);
        try {
          const { data, error } = await supabase
            .from('t_insumos')
            .select('*')
            .eq('id', insumoId)
            .single();

          if (error) throw error;
          if (data) {
            reset({
              nombre: data.nombre || '',
              codigo: data.codigo || '',
              categoria_id: data.categoria_id || '',
              unidad_stock_id: data.unidad_stock_id || '',
              unidad_compra_id: data.unidad_compra_id || '',
              factor_compra: data.factor_compra ? Number(data.factor_compra) : 1,
              stock_minimo: data.stock_minimo ? Number(data.stock_minimo) : 0,
              ultimo_costo_compra: data.ultimo_costo_compra ? Number(data.ultimo_costo_compra) : 0,
              observaciones: data.observaciones || '',
              stock_inicial: 0,
            });
          }
        } catch (err: any) {
          toast.error('Error al cargar datos del insumo: ' + err.message);
        } finally {
          setFetching(false);
        }
      };
      fetchInsumo();
    }
  }, [insumoId, reset]);

  const stockUnitName = unidades.find((u) => u.id === selectedUnidadStockId)?.nombre || 'Unidad';
  const compraUnitName = unidades.find((u) => u.id === selectedUnidadCompraId)?.nombre || 'Unidad de compra';

  const onSubmit = async (formData: InsumoFormValues) => {
    const nombreTrimmed = formData.nombre?.trim();
    if (!nombreTrimmed) {
      toast.error('El nombre del insumo es obligatorio');
      return;
    }

    if (!formData.unidad_stock_id) {
      toast.error('La unidad de stock es obligatoria');
      return;
    }

    const factorNum = hasUnidadCompra ? Math.max(0.0001, Number(formData.factor_compra) || 1) : 1;
    const stockMinimoNum = Math.max(0, Number(formData.stock_minimo) || 0);
    const ultimoCostoNum = Math.max(0, Number(formData.ultimo_costo_compra) || 0);
    const stockInicialNum = Math.max(0, Number(formData.stock_inicial) || 0);

    setLoading(true);
    try {
      if (isEditing) {
        // En update: NO enviamos stock ni unidad_stock_id (es fija)
        const updatePayload: Record<string, any> = {
          nombre: nombreTrimmed,
          codigo: formData.codigo?.trim() || null,
          categoria_id: formData.categoria_id || null,
          unidad_compra_id: hasUnidadCompra ? formData.unidad_compra_id : null,
          factor_compra: factorNum,
          stock_minimo: stockMinimoNum,
          ultimo_costo_compra: ultimoCostoNum,
          observaciones: formData.observaciones?.trim() || null,
        };

        const { error } = await supabase
          .from('t_insumos')
          .update(updatePayload)
          .eq('id', insumoId);

        if (error) throw error;
        toast.success('Insumo actualizado correctamente');
      } else {
        // En insert: NO enviamos stock, ni id, ni created_at, ni activo
        const insertPayload: Record<string, any> = {
          nombre: nombreTrimmed,
          codigo: formData.codigo?.trim() || null,
          categoria_id: formData.categoria_id || null,
          unidad_stock_id: formData.unidad_stock_id,
          unidad_compra_id: hasUnidadCompra ? formData.unidad_compra_id : null,
          factor_compra: factorNum,
          stock_minimo: stockMinimoNum,
          ultimo_costo_compra: ultimoCostoNum,
          observaciones: formData.observaciones?.trim() || null,
        };

        const { data: createdData, error: insertError } = await supabase
          .from('t_insumos')
          .insert([insertPayload])
          .select()
          .single();

        if (insertError) throw insertError;

        // Si se especificó stock inicial > 0, registramos movimiento de ajuste por RPC
        if (stockInicialNum > 0 && createdData?.id) {
          const { error: rpcError } = await supabase.rpc('registrar_movimiento_stock', {
            p_insumo_id: createdData.id,
            p_tipo: 'ajuste',
            p_cantidad: null,
            p_stock_objetivo: stockInicialNum,
            p_en_unidad_compra: false,
            p_motivo: 'Stock inicial',
            p_referencia_tipo: 'manual',
            p_referencia_id: null,
            p_usuario_id: user?.id || null,
          });

          if (rpcError) {
            console.error('Error al registrar stock inicial:', rpcError);
            toast.error('Insumo creado, pero ocurrió un error al cargar el stock inicial: ' + rpcError.message);
          } else {
            toast.success(`Insumo registrado con stock inicial de ${stockInicialNum.toLocaleString('es-AR')} ${stockUnitName}`);
          }
        } else {
          toast.success('Insumo registrado correctamente');
        }
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Error guardando insumo:', err);
      toast.error('Error al guardar insumo: ' + (err.message || 'Error inesperado'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300">
      <div className="bg-white w-full max-w-3xl max-h-[90vh] rounded-[2.5rem] shadow-2xl border border-white/20 flex flex-col overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-12 duration-500">
        {/* Header */}
        <div className="px-10 py-8 border-b border-outline-variant/10 flex justify-between items-center bg-surface-container-low/30 shrink-0">
          <div>
            <h3 className="text-3xl font-headline font-extrabold text-on-surface tracking-tight">
              {isEditing ? 'Editar Insumo' : 'Nuevo Insumo'}
            </h3>
            <p className="text-xs text-on-surface-variant font-bold uppercase tracking-widest mt-1">
              {isEditing
                ? 'Modificar características y parámetros del insumo'
                : 'Registrar materia prima, papel, tinta o insumo de producción'}
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
            <p className="text-xs font-black uppercase tracking-widest text-outline">Cargando insumo...</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="flex-1 overflow-y-auto no-scrollbar p-10 space-y-8">
            {/* Sección: Identificación del Insumo */}
            <div className="space-y-6">
              <div className="flex items-center gap-3 text-primary">
                <span className="material-symbols-outlined font-bold">inventory_2</span>
                <h4 className="text-sm font-black uppercase tracking-[0.2em]">Identificación</h4>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-1 md:col-span-2">
                  <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">
                    Nombre del Insumo <span className="text-error">*</span>
                  </label>
                  <input
                    {...register('nombre', { required: 'El nombre es obligatorio' })}
                    placeholder="Ej: Papel Ilustración 150g (72x102)"
                    autoFocus={!isEditing}
                    className="w-full bg-surface-container-low border-none rounded-2xl py-3.5 px-4 text-sm font-bold focus:ring-2 focus:ring-primary/20 shadow-inner"
                  />
                  {errors.nombre && (
                    <p className="text-[10px] text-error font-bold mt-1 ml-1">{errors.nombre.message}</p>
                  )}
                </div>

                <div className="space-y-1 md:col-span-1">
                  <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">
                    Código / SKU
                  </label>
                  <input
                    {...register('codigo')}
                    placeholder="Ej: PAP-ILU-150"
                    className="w-full bg-surface-container-low border-none rounded-2xl py-3.5 px-4 text-sm font-bold focus:ring-2 focus:ring-primary/20 shadow-inner"
                  />
                </div>

                <div className="space-y-1 md:col-span-3">
                  <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">
                    Categoría de Insumo
                  </label>
                  <select
                    {...register('categoria_id')}
                    className="w-full bg-surface-container-low border-none rounded-2xl py-3.5 px-4 text-sm font-bold focus:ring-2 focus:ring-primary/20 appearance-none cursor-pointer"
                  >
                    <option value="">Sin categoría</option>
                    {categorias.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.nombre}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <hr className="border-outline-variant/10" />

            {/* Sección: Unidades de Medida y Conversión */}
            <div className="space-y-6">
              <div className="flex items-center gap-3 text-primary">
                <span className="material-symbols-outlined font-bold">scale</span>
                <h4 className="text-sm font-black uppercase tracking-[0.2em]">Unidades de Medida</h4>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Unidad de Stock */}
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">
                    Unidad de stock (en la que se cuenta y consume) <span className="text-error">*</span>
                  </label>
                  <select
                    {...register('unidad_stock_id', { required: 'La unidad de stock es requerida' })}
                    disabled={isEditing}
                    className={`w-full bg-surface-container-low border-none rounded-2xl py-3.5 px-4 text-sm font-bold focus:ring-2 focus:ring-primary/20 appearance-none ${
                      isEditing ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'
                    }`}
                  >
                    <option value="">Seleccionar unidad...</option>
                    {unidades.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.nombre}
                      </option>
                    ))}
                  </select>
                  {isEditing && (
                    <p className="text-[10px] text-outline font-bold mt-1 ml-1 flex items-center gap-1">
                      <span className="material-symbols-outlined text-xs">lock</span>
                      La unidad de stock no se puede cambiar después de crear el insumo
                    </p>
                  )}
                  {errors.unidad_stock_id && (
                    <p className="text-[10px] text-error font-bold mt-1 ml-1">{errors.unidad_stock_id.message}</p>
                  )}
                </div>

                {/* Unidad de Compra */}
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">
                    Unidad de compra (si se compra en otra unidad)
                  </label>
                  <select
                    {...register('unidad_compra_id')}
                    className="w-full bg-surface-container-low border-none rounded-2xl py-3.5 px-4 text-sm font-bold focus:ring-2 focus:ring-primary/20 appearance-none cursor-pointer"
                  >
                    <option value="">Igual que la de stock / no aplica</option>
                    {unidades.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.nombre}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Factor de compra interactivo */}
                {hasUnidadCompra && (
                  <div className="md:col-span-2 p-5 bg-indigo-50/50 rounded-2xl border border-indigo-100 space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
                    <p className="text-[10px] font-black uppercase tracking-widest text-indigo-700">
                      Factor de Conversión de Compra
                    </p>
                    <div className="flex flex-wrap items-center gap-3 text-sm font-bold text-on-surface">
                      <span className="px-3 py-1.5 bg-white rounded-xl border border-indigo-200 text-indigo-900 font-extrabold shadow-sm">
                        1 {compraUnitName}
                      </span>
                      <span className="text-indigo-600 font-black">=</span>
                      <div className="w-32">
                        <input
                          type="number"
                          step="any"
                          min="0.0001"
                          {...register('factor_compra', { required: hasUnidadCompra, min: 0.0001 })}
                          className="w-full bg-white border border-indigo-200 rounded-xl py-2 px-3 text-sm font-black text-indigo-900 focus:ring-2 focus:ring-indigo-300 shadow-sm"
                          placeholder="500"
                        />
                      </div>
                      <span className="px-3 py-1.5 bg-white rounded-xl border border-indigo-200 text-indigo-900 font-extrabold shadow-sm">
                        {stockUnitName}
                      </span>
                    </div>
                    <p className="text-[10px] text-indigo-600/80 font-medium">
                      Al ingresar mercadería por {compraUnitName}, el sistema sumará automáticamente el equivalente en {stockUnitName}.
                    </p>
                  </div>
                )}
              </div>
            </div>

            <hr className="border-outline-variant/10" />

            {/* Sección: Stock, Costos y Parámetros */}
            <div className="space-y-6">
              <div className="flex items-center gap-3 text-primary">
                <span className="material-symbols-outlined font-bold">tune</span>
                <h4 className="text-sm font-black uppercase tracking-[0.2em]">Control y Costos</h4>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Stock Mínimo */}
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">
                    Stock Mínimo (alerta en {stockUnitName})
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    {...register('stock_minimo')}
                    placeholder="0"
                    className="w-full bg-surface-container-low border-none rounded-2xl py-3.5 px-4 text-sm font-bold focus:ring-2 focus:ring-primary/20 shadow-inner"
                  />
                  <p className="text-[9px] text-outline font-bold mt-1 ml-1">
                    0 = sin alerta. Se notificará cuando el stock sea menor o igual.
                  </p>
                </div>

                {/* Último Costo de Compra */}
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">
                    Último Costo de Compra ($ por {hasUnidadCompra ? compraUnitName : stockUnitName})
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    {...register('ultimo_costo_compra')}
                    placeholder="0.00"
                    className="w-full bg-surface-container-low border-none rounded-2xl py-3.5 px-4 text-sm font-bold focus:ring-2 focus:ring-primary/20 shadow-inner"
                  />
                  <p className="text-[9px] text-outline font-bold mt-1 ml-1">
                    Precio de referencia para la valoración total de existencias.
                  </p>
                </div>

                {/* Stock Inicial — Solo en Alta */}
                {!isEditing && (
                  <div className="space-y-1 md:col-span-2 p-5 bg-emerald-50/50 rounded-2xl border border-emerald-100">
                    <label className="text-[10px] font-black text-emerald-800 uppercase tracking-widest ml-1">
                      Stock Inicial ({stockUnitName})
                    </label>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      {...register('stock_inicial')}
                      placeholder="0"
                      className="w-full bg-white border border-emerald-200 rounded-2xl py-3.5 px-4 text-sm font-bold text-emerald-900 focus:ring-2 focus:ring-emerald-400 shadow-sm"
                    />
                    <p className="text-[10px] text-emerald-700/80 font-medium mt-1">
                      Opcional. Si ingresás un valor mayor a 0, se registrará automáticamente un movimiento inicial de ajuste.
                    </p>
                  </div>
                )}

                {/* Observaciones */}
                <div className="space-y-1 md:col-span-2">
                  <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">
                    Observaciones / Especificaciones Técnicas
                  </label>
                  <textarea
                    {...register('observaciones')}
                    rows={3}
                    className="w-full bg-surface-container-low border-none rounded-3xl py-4 px-6 text-sm font-bold focus:ring-2 focus:ring-primary/20 resize-none shadow-inner"
                    placeholder="Gramaje, fabricante, ubicación en estantería, recomendaciones de almacenamiento..."
                  />
                </div>
              </div>
            </div>
          </form>
        )}

        {/* Footer Actions */}
        <div className="px-10 py-8 bg-surface-container-low/50 border-t border-outline-variant/10 flex gap-4 shrink-0">
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
                <span className="material-symbols-outlined">{isEditing ? 'save' : 'inventory'}</span>
                <span>{isEditing ? 'Guardar Cambios' : 'Registrar Insumo'}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default InsumoModal;
