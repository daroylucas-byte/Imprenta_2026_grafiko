import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { toast } from 'react-hot-toast';
import { useForm } from 'react-hook-form';
import { useAuthStore } from '../store/authStore';

// Interfaces
interface Promocion {
  id: string;
  titulo: string;
  descripcion: string;
  hashtags: string[] | null;
  llamada_accion: string;
  estado: 'pendiente' | 'aprobada' | 'rechazada';
  imagen_url: string | null;
  created_at: string;
}

interface TransaccionMarketing {
  id: string;
  tipo: 'carga' | 'generar_promos' | 'analizar_identidad' | 'generar_imagen';
  monto: number;
  descripcion: string;
  usuario_id: string | null;
  created_at: string;
}

interface IdentidadVisual {
  id: string;
  imagen_url: string;
  descripcion: string | null;
  created_at: string;
}

interface AnalisisIdentidad {
  id: number;
  estilo_descripcion: string | null;
  updated_at: string;
}

// Sub-components: CargarSaldoModal
interface CargarSaldoModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

const CargarSaldoModal: React.FC<CargarSaldoModalProps> = ({ onClose, onSuccess }) => {
  const [loading, setLoading] = useState(false);
  const { user } = useAuthStore();
  const { register, handleSubmit, formState: { errors } } = useForm({
    defaultValues: {
      monto: '',
      descripcion: 'Recarga manual',
    }
  });

  const onSubmit = async (data: any) => {
    setLoading(true);
    try {
      const { data: newSaldo, error } = await supabase.rpc('cargar_saldo_marketing', {
        p_monto: Number(data.monto),
        p_descripcion: data.descripcion || null,
        p_usuario_id: user?.id || null
      });

      if (error) throw error;

      toast.success(`Saldo cargado correctamente. Nuevo saldo: $${Number(newSaldo).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`);
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Error loading marketing balance:', err);
      toast.error('Error al cargar saldo: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300">
      <div className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl border border-white/20 flex flex-col overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-12 duration-500">
        <div className="px-10 py-8 border-b border-outline-variant/10 flex justify-between items-center bg-violet-50/50">
          <div>
            <h3 className="text-2xl font-headline font-extrabold text-on-surface tracking-tight">Cargar Saldo Marketing</h3>
            <p className="text-[10px] font-black text-violet-700 uppercase tracking-widest mt-1">Créditos de Inteligencia Artificial</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-error/10 text-on-surface-variant hover:text-error rounded-full transition-all">
            <span className="material-symbols-outlined text-2xl">close</span>
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="p-10 space-y-6">
          <div className="space-y-1">
            <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">Monto a Cargar ($)</label>
            <input 
              type="number" step="0.01" autoFocus
              {...register('monto', { required: true, min: 0.01 })}
              placeholder="0.00"
              className="w-full bg-surface-container-low border-none rounded-2xl py-4 px-6 text-2xl font-black text-violet-700 focus:ring-2 focus:ring-violet-700/20 transition-all shadow-inner"
            />
            {errors.monto && <p className="text-[10px] text-error font-bold mt-1 ml-1">Ingresa un monto de carga válido (mínimo 0.01)</p>}
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">Descripción / Referencia</label>
            <input 
              type="text"
              {...register('descripcion')}
              placeholder="Ej: Carga mensual de marketing"
              className="w-full bg-surface-container-low border-none rounded-2xl py-3 px-4 text-sm font-bold focus:ring-2 focus:ring-violet-700/20 transition-all shadow-inner"
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
              className="flex-[2] py-4 bg-violet-600 text-white font-bold rounded-2xl shadow-xl shadow-violet-500/20 hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-2 text-[10px] uppercase tracking-widest"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[1.2rem]">add_card</span>
                  <span>Confirmar Carga</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Main Page Component
const PromotionsPage: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [saldo, setSaldo] = useState<number>(0);
  const [promociones, setPromociones] = useState<Promocion[]>([]);
  const [transacc, setTransacc] = useState<TransaccionMarketing[]>([]);
  const [instruccionExtra, setInstruccionExtra] = useState<string>('');
  const [savingConfig, setSavingConfig] = useState(false);

  // Identidad Visual states
  const [identidades, setIdentidades] = useState<IdentidadVisual[]>([]);
  const [analisis, setAnalisis] = useState<AnalisisIdentidad | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [analyzingIdentidad, setAnalyzingIdentidad] = useState(false);

  // Flyer generating state per promotion id
  const [generandoFlyerId, setGenerandoFlyerId] = useState<string | null>(null);

  // Modal open states
  const [isCargarOpen, setIsCargarOpen] = useState(false);
  const [isHistoryCollapsed, setIsHistoryCollapsed] = useState(true);

  const { user } = useAuthStore();

  const fetchMarketingData = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Fetch current wallet balance
      const { data: saldoData, error: saldoError } = await supabase
        .from('t_saldo_marketing')
        .select('saldo')
        .eq('id', 1)
        .maybeSingle();

      if (saldoError) throw saldoError;
      setSaldo(saldoData?.saldo ? Number(saldoData.saldo) : 0);

      // 2. Fetch promotions
      const { data: promoData, error: promoError } = await supabase
        .from('t_promociones')
        .select('*')
        .order('created_at', { ascending: false });

      if (promoError) throw promoError;
      console.log('TEMPORAL: promoData fetched:', promoData);
      setPromociones(promoData || []);

      // 3. Fetch configuration singleton
      const { data: configData, error: configError } = await supabase
        .from('t_config_promo')
        .select('instruccion_extra')
        .eq('id', 1)
        .maybeSingle();

      if (configError) throw configError;
      setInstruccionExtra(configData?.instruccion_extra || '');

      // 4. Fetch transaction logs
      const { data: txData, error: txError } = await supabase
        .from('t_transacciones_marketing')
        .select('*')
        .order('created_at', { ascending: false });

      if (txError) throw txError;
      setTransacc(txData || []);

      // 5. Fetch visual identity images
      const { data: idVisualData, error: idVisualError } = await supabase
        .from('t_identidad_visual')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);

      if (idVisualError) throw idVisualError;
      setIdentidades(idVisualData || []);

      // 6. Fetch identity analysis
      const { data: analisisData, error: analisisError } = await supabase
        .from('t_analisis_identidad')
        .select('*')
        .eq('id', 1)
        .maybeSingle();

      if (analisisError) throw analisisError;
      setAnalisis(analisisData);

    } catch (err: any) {
      console.error('Error fetching marketing data:', err);
      toast.error('Error al cargar datos de marketing: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMarketingData();
  }, [fetchMarketingData]);

  // Handle generative AI call
  const handleGeneratePromos = async () => {
    if (saldo < 600) {
      toast.error('Saldo insuficiente para generar propuestas.');
      return;
    }

    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('generar-promos', {
        body: { usuario_id: user?.id ?? null }
      });

      // Parse error if response is not ok
      if (error) {
        let errorMsg = error.message || 'Error al generar promociones';
        if (error instanceof Error) {
          const context = (error as any).context;
          if (context && typeof context.text === 'function') {
            try {
              const text = await context.text();
              const parsed = JSON.parse(text);
              if (parsed.error) errorMsg = parsed.error;
            } catch (e) {}
          }
        }
        throw new Error(errorMsg);
      }

      if (data && data.error) {
        throw new Error(data.error);
      }

      toast.success('¡Se generaron 4 propuestas de promoción con IA!');
      fetchMarketingData();
    } catch (err: any) {
      console.error('Error invoking edge function:', err);
      toast.error('Error de generación: ' + err.message);
    } finally {
      setGenerating(false);
    }
  };

  // Upload visual identity image
  const handleUploadIdentidad = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploadingImage(true);
    const toastId = toast.loading('Subiendo imágenes...');
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}.${fileExt}`;
        const filePath = `identidad/${fileName}`;

        // 1. Upload to public bucket 'marketing'
        const { error: uploadError } = await supabase.storage
          .from('marketing')
          .upload(filePath, file);

        if (uploadError) throw uploadError;

        // 2. Get public URL
        const { data: { publicUrl } } = supabase.storage
          .from('marketing')
          .getPublicUrl(filePath);

        // 3. Insert record to t_identidad_visual
        const { error: insertError } = await supabase
          .from('t_identidad_visual')
          .insert({
            imagen_url: publicUrl,
            descripcion: file.name
          });

        if (insertError) throw insertError;
      }

      toast.success('Imágenes subidas correctamente', { id: toastId });
      fetchMarketingData();
    } catch (err: any) {
      console.error('Error uploading visual identity images:', err);
      toast.error('Error al subir imágenes: ' + err.message, { id: toastId });
    } finally {
      setUploadingImage(false);
      e.target.value = '';
    }
  };

  // Delete visual identity image
  const handleDeleteIdentidad = async (id: string, imageUrl: string) => {
    const toastId = toast.loading('Eliminando imagen...');
    try {
      const { error: deleteError } = await supabase
        .from('t_identidad_visual')
        .delete()
        .eq('id', id);

      if (deleteError) throw deleteError;

      // Extract storage path from url
      try {
        const urlObj = new URL(imageUrl);
        const pathParts = urlObj.pathname.split('/marketing/');
        if (pathParts.length > 1) {
          const storagePath = decodeURIComponent(pathParts[1]);
          await supabase.storage.from('marketing').remove([storagePath]);
        }
      } catch (err) {
        console.warn('Could not delete file from storage directly:', err);
      }

      toast.success('Imagen eliminada correctamente', { id: toastId });
      fetchMarketingData();
    } catch (err: any) {
      console.error('Error deleting visual identity image:', err);
      toast.error('Error al eliminar imagen: ' + err.message, { id: toastId });
    }
  };

  // Analyze Visual Identity (Gemini)
  const handleAnalizarIdentidad = async () => {
    if (identidades.length === 0) {
      toast.error('No hay imágenes de referencia cargadas para analizar.');
      return;
    }
    if (saldo < 500) {
      toast.error('Saldo insuficiente para analizar identidad visual.');
      return;
    }

    setAnalyzingIdentidad(true);
    const toastId = toast.loading('Analizando identidad visual con Gemini...');
    try {
      const { data, error } = await supabase.functions.invoke('analizar-identidad', {
        body: { usuario_id: user?.id ?? null }
      });

      if (error) {
        let errorMsg = error.message || 'Error al analizar identidad visual';
        if (error instanceof Error) {
          const context = (error as any).context;
          if (context && typeof context.text === 'function') {
            try {
              const text = await context.text();
              const parsed = JSON.parse(text);
              if (parsed.error) errorMsg = parsed.error;
            } catch (e) {}
          }
        }
        throw new Error(errorMsg);
      }

      if (data && data.error) {
        throw new Error(data.error);
      }

      toast.success('¡Identidad visual analizada correctamente!', { id: toastId });
      fetchMarketingData();
    } catch (err: any) {
      console.error('Error analyzing visual identity:', err);
      toast.error('Error de análisis: ' + err.message, { id: toastId });
    } finally {
      setAnalyzingIdentidad(false);
    }
  };

  // Generate Flyer (Gemini)
  const handleGenerarFlyer = async (promocionId: string) => {
    if (saldo < 1250) {
      toast.error('Saldo insuficiente para generar flyer.');
      return;
    }

    setGenerandoFlyerId(promocionId);
    const toastId = toast.loading('Generando flyer con Gemini...');
    try {
      const { data, error } = await supabase.functions.invoke('generar-imagen', {
        body: { promocion_id: promocionId, usuario_id: user?.id ?? null }
      });

      if (error) {
        let errorMsg = error.message || 'Error al generar flyer';
        if (error instanceof Error) {
          const context = (error as any).context;
          if (context && typeof context.text === 'function') {
            try {
              const text = await context.text();
              const parsed = JSON.parse(text);
              if (parsed.error) errorMsg = parsed.error;
            } catch (e) {}
          }
        }
        throw new Error(errorMsg);
      }

      if (data && data.error) {
        throw new Error(data.error);
      }

      toast.success('¡Flyer generated correctly!', { id: toastId });
      await fetchMarketingData();
    } catch (err: any) {
      console.error('Error generating flyer:', err);
      toast.error('Error al generar flyer: ' + err.message, { id: toastId });
    } finally {
      setGenerandoFlyerId(null);
    }
  };

  // Update promotion state (Aprove / Rechazar)
  const handleUpdateStatus = async (id: string, nuevoEstado: 'aprobada' | 'rechazada') => {
    try {
      const { error } = await supabase
        .from('t_promociones')
        .update({ estado: nuevoEstado })
        .eq('id', id);

      if (error) throw error;

      toast.success(nuevoEstado === 'aprobada' ? 'Promoción aprobada' : 'Promoción rechazada');
      
      // Update state locally to avoid full fetch if possible, or just re-fetch
      setPromociones(prev => prev.map(p => p.id === id ? { ...p, estado: nuevoEstado } : p));
    } catch (err: any) {
      console.error('Error updating promotion state:', err);
      toast.error('Error al actualizar estado: ' + err.message);
    }
  };

  // Save prompt instruction configuration
  const handleSaveConfig = async () => {
    setSavingConfig(true);
    try {
      const { error } = await supabase
        .from('t_config_promo')
        .upsert({ id: 1, instruccion_extra: instruccionExtra || null });

      if (error) throw error;
      toast.success('Instrucciones guardadas correctamente');
    } catch (err: any) {
      console.error('Error saving prompt configuration:', err);
      toast.error('Error al guardar configuración: ' + err.message);
    } finally {
      setSavingConfig(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in duration-700">
      {/* Upper Panel: Wallet & Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Wallet Display Card */}
        <div className="md:col-span-2 bg-gradient-to-br from-violet-700 to-indigo-900 p-8 rounded-[2rem] shadow-xl text-white flex flex-col justify-between group relative overflow-hidden">
          <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none transition-transform group-hover:scale-110 duration-500">
            <span className="material-symbols-outlined text-[10rem]">auto_awesome</span>
          </div>
          
          <div className="space-y-1">
            <p className="text-[10px] font-black uppercase tracking-widest text-violet-200">Saldo Inteligencia Artificial</p>
            <h3 className="text-4xl font-headline font-extrabold tracking-tight">
              ${Number(saldo).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
            </h3>
            <p className="text-[10px] font-bold text-violet-200/70 uppercase tracking-widest mt-1">Créditos de marketing disponibles</p>
          </div>

          <div className="flex flex-wrap gap-4 mt-6 pt-6 border-t border-white/10 justify-between items-center">
            <span className="text-[10px] font-black uppercase tracking-widest text-violet-100 flex items-center gap-1.5">
              <span className="material-symbols-outlined text-sm">info</span>
              Costo por generación: 600 créditos
            </span>
            
            <button 
              onClick={() => setIsCargarOpen(true)}
              className="flex items-center gap-2 px-6 py-3 bg-white text-violet-900 font-bold rounded-2xl text-[10px] uppercase tracking-widest hover:bg-violet-50 transition-all active:scale-95 shadow-md shadow-black/10"
            >
              <span className="material-symbols-outlined text-base">add_card</span>
              Cargar Saldo
            </button>
          </div>
        </div>

        {/* Generate Card Actions */}
        <div className="bg-surface-container-lowest p-8 rounded-[2rem] border border-outline-variant/10 shadow-sm flex flex-col justify-between group hover:border-violet-500/20 transition-all">
          <div className="space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-violet-100 text-violet-700 flex items-center justify-center transition-all group-hover:bg-violet-600 group-hover:text-white">
              <span className="material-symbols-outlined">auto_awesome</span>
            </div>
            <div>
              <h4 className="text-lg font-headline font-extrabold text-on-surface leading-snug">Generar Propuestas</h4>
              <p className="text-xs text-on-surface-variant font-bold mt-1">Crea 4 propuestas de contenido publicitario y hashtags optimizados para tu negocio.</p>
            </div>
          </div>

          <div className="mt-6">
            {saldo < 600 ? (
              <div className="w-full">
                <button 
                  disabled
                  title="Saldo insuficiente, cargá crédito primero"
                  className="w-full flex items-center justify-center gap-2 py-4 bg-slate-100 text-slate-400 font-bold rounded-2xl text-[10px] uppercase tracking-widest border border-slate-200 cursor-not-allowed opacity-60"
                >
                  <span className="material-symbols-outlined text-base">lock</span>
                  <span>Saldo Insuficiente</span>
                </button>
                <p className="text-[9px] text-center text-error font-bold uppercase tracking-wider mt-2">Requerido: 600 créditos</p>
              </div>
            ) : (
              <button 
                disabled={generating}
                onClick={handleGeneratePromos}
                className="w-full flex items-center justify-center gap-2 py-4 bg-violet-600 text-white font-bold rounded-2xl text-[10px] uppercase tracking-widest shadow-xl shadow-violet-500/20 hover:brightness-110 active:scale-95 transition-all"
              >
                {generating ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                    <span>Generando (puede tardar)...</span>
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-base font-bold animate-pulse">bolt</span>
                    <span>Generar 4 Propuestas (600)</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>

      </div>

      {/* Main Grid: Left list of promotions, Right prompt configuration */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column (span 2): Promo proposals list */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-surface-container-lowest rounded-[2.5rem] shadow-sm border border-outline-variant/10 overflow-hidden">
            <div className="p-8 border-b border-outline-variant/5 flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-headline font-extrabold text-on-surface tracking-tight">Propuestas Generadas</h2>
                <p className="text-[10px] text-outline font-bold uppercase tracking-wider mt-0.5">Propuestas de redacción creadas por la IA</p>
              </div>
            </div>

            {loading ? (
              <div className="py-20 flex flex-col items-center justify-center space-y-4 text-violet-300">
                <div className="w-10 h-10 border-4 border-violet-100 border-t-violet-600 rounded-full animate-spin"></div>
                <p className="text-[10px] font-black uppercase tracking-widest">Obteniendo propuestas...</p>
              </div>
            ) : promociones.length === 0 ? (
              <div className="py-24 text-center text-outline/50 italic text-sm flex flex-col items-center justify-center space-y-4">
                <span className="material-symbols-outlined text-5xl text-outline/30">campaign</span>
                <p className="max-w-xs font-bold leading-normal">
                  No hay propuestas de promoción generadas aún. Presiona el botón de arriba para crear las primeras propuestas.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-outline-variant/5">
                {promociones.map((promo, idx) => (
                  <div 
                    key={promo.id} 
                    className="p-8 hover:bg-slate-50/40 transition-colors animate-in fade-in slide-in-from-bottom-4 duration-300"
                    style={{ animationDelay: `${idx * 40}ms` }}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4 mb-3">
                      <div>
                        <h4 className="text-lg font-headline font-extrabold text-on-surface tracking-tight">
                          {promo.titulo}
                        </h4>
                        <p className="text-[9px] font-bold text-outline/70 uppercase tracking-widest mt-0.5">
                          Creado el {new Date(promo.created_at).toLocaleString('es-AR')}
                        </p>
                      </div>

                      {/* Estado Badge */}
                      <span className={`px-2.5 py-1 text-[9px] font-black uppercase rounded-lg tracking-widest border ${
                        promo.estado === 'aprobada' 
                          ? 'bg-emerald-50 text-emerald-600 border-emerald-100'
                          : promo.estado === 'rechazada'
                          ? 'bg-error/5 text-error border-error/10'
                          : 'bg-amber-50 text-amber-600 border-amber-100'
                      }`}>
                        {promo.estado}
                      </span>
                    </div>

                    <p className="text-sm font-medium text-on-surface-variant leading-relaxed mb-4 whitespace-pre-wrap">
                      {promo.descripcion}
                    </p>

                    {/* Action Call / Llamada a la acción */}
                    {promo.llamada_accion && (
                      <div className="mb-4 bg-slate-50 border border-slate-100 rounded-xl p-3 flex items-center gap-3">
                        <span className="material-symbols-outlined text-primary text-base">link</span>
                        <div className="text-xs">
                          <span className="text-[9px] font-black uppercase tracking-wider text-outline block leading-none">Llamada a la Acción</span>
                          <span className="font-bold text-on-surface-variant">{promo.llamada_accion}</span>
                        </div>
                      </div>
                    )}

                    {/* Hashtags list */}
                    {promo.hashtags && promo.hashtags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-4">
                        {promo.hashtags.map((tag, tagIdx) => (
                          <span key={tagIdx} className="bg-violet-50 text-violet-700 border border-violet-100 rounded-lg px-2 py-0.5 text-[10px] font-bold">
                            #{tag.replace(/^#/, '')}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Flyer Image display */}
                    {promo.imagen_url && (
                      <div className="mb-6 relative group rounded-2xl overflow-hidden border border-outline-variant/10 shadow-sm max-w-sm">
                        <img 
                          src={promo.imagen_url} 
                          alt="Flyer publicitario" 
                          className="w-full object-cover max-h-64 hover:scale-[1.02] transition-transform duration-500" 
                          onError={(e) => {
                            console.error(`Error al cargar la imagen del flyer para la promo ${promo.id}. URL: ${promo.imagen_url}`, e);
                            toast.error(`Error al cargar la imagen del flyer`);
                          }}
                        />
                        <div className="absolute bottom-3 right-3 flex gap-2">
                          <a 
                            href={promo.imagen_url} 
                            target="_blank" 
                            rel="noreferrer"
                            className="bg-black/70 hover:bg-black/90 text-white rounded-xl px-3 py-1.5 text-[9px] font-black uppercase tracking-widest flex items-center gap-1 backdrop-blur-sm transition-all"
                          >
                            <span className="material-symbols-outlined text-xs">open_in_new</span>
                            Ver
                          </a>
                          
                          <a 
                            href={promo.imagen_url} 
                            download={`flyer-${promo.id}.png`}
                            target="_blank"
                            rel="noreferrer"
                            className="bg-black/70 hover:bg-black/90 text-white rounded-xl px-3 py-1.5 text-[9px] font-black uppercase tracking-widest flex items-center gap-1 backdrop-blur-sm transition-all"
                          >
                            <span className="material-symbols-outlined text-xs">download</span>
                            Bajar
                          </a>
                        </div>
                      </div>
                    )}

                    {/* Actions and Flyer generation */}
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      {promo.estado === 'pendiente' ? (
                        <div className="flex gap-3">
                          <button 
                            onClick={() => handleUpdateStatus(promo.id, 'rechazada')}
                            className="flex items-center gap-1.5 px-4 py-2 bg-white text-error font-bold rounded-xl text-[10px] uppercase tracking-widest hover:bg-error/5 border border-error/20 transition-all active:scale-95"
                          >
                            <span className="material-symbols-outlined text-sm font-black">close</span>
                            Rechazar
                          </button>
                          
                          <button 
                            onClick={() => handleUpdateStatus(promo.id, 'aprobada')}
                            className="flex items-center gap-1.5 px-5 py-2 bg-emerald-600 text-white font-bold rounded-xl text-[10px] uppercase tracking-widest hover:brightness-110 transition-all active:scale-95 shadow-md shadow-emerald-500/10"
                          >
                            <span className="material-symbols-outlined text-sm font-black">check</span>
                            Aprobar
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-outline/50 text-[10px] font-black uppercase tracking-widest">
                          {promo.estado === 'aprobada' ? (
                            <>
                              <span className="material-symbols-outlined text-emerald-600 font-black text-lg">task_alt</span>
                              <span>Propuesta Aprobada</span>
                            </>
                          ) : (
                            <>
                              <span className="material-symbols-outlined text-error font-black text-lg">cancel</span>
                              <span>Propuesta Rechazada</span>
                            </>
                          )}
                        </div>
                      )}

                      {/* Flyer Generator Action Button */}
                      <button
                        disabled={generandoFlyerId !== null || saldo < 1250}
                        onClick={() => handleGenerarFlyer(promo.id)}
                        className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 ${
                          promo.imagen_url 
                            ? 'bg-slate-900 text-white hover:bg-violet-600 shadow-md shadow-slate-900/10' 
                            : 'bg-violet-100 text-violet-700 hover:bg-violet-600 hover:text-white'
                        }`}
                      >
                        {generandoFlyerId === promo.id ? (
                          <>
                            <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
                            <span>Generando Flyer...</span>
                          </>
                        ) : (
                          <>
                            <span className="material-symbols-outlined text-sm font-bold">auto_fix_high</span>
                            <span>{promo.imagen_url ? 'Regenerar Flyer (1250)' : 'Generar Flyer (1250)'}</span>
                          </>
                        )}
                      </button>
                    </div>

                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Prompt Context Settings & Transaction Audit logs */}
        <div className="space-y-8">
          
          {/* Identidad Visual Panel */}
          <div className="bg-surface-container-lowest p-8 rounded-[2.5rem] shadow-sm border border-outline-variant/10 space-y-6">
            <div>
              <h3 className="text-xl font-headline font-extrabold text-on-surface tracking-tight">Identidad Visual</h3>
              <p className="text-[10px] text-outline font-bold uppercase tracking-wider mt-0.5">Analiza el estilo visual de tu marca</p>
            </div>

            {/* Subida de imágenes */}
            <div className="space-y-2">
              <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1 block">Subir imágenes de referencia</label>
              <label className="flex flex-col items-center justify-center border-2 border-dashed border-outline-variant/30 hover:border-violet-500/50 rounded-2xl p-6 cursor-pointer bg-slate-50/50 hover:bg-violet-50/20 transition-all text-center group">
                <span className="material-symbols-outlined text-3xl text-outline/50 group-hover:text-violet-600 transition-colors animate-pulse">cloud_upload</span>
                <span className="text-xs font-bold text-on-surface-variant mt-2 group-hover:text-violet-700">Haz clic para buscar o arrastra</span>
                <span className="text-[9px] text-outline mt-1 font-semibold uppercase tracking-wider">Formatos soportados: JPG, PNG</span>
                <input 
                  type="file" 
                  accept="image/*" 
                  multiple 
                  disabled={uploadingImage}
                  onChange={handleUploadIdentidad} 
                  className="hidden" 
                />
              </label>
            </div>

            {/* Grid of uploaded thumbnails */}
            {identidades.length > 0 && (
              <div className="space-y-2">
                <span className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1 block">Imágenes cargadas ({identidades.length}/10)</span>
                <div className="grid grid-cols-5 gap-2">
                  {identidades.map((img) => (
                    <div key={img.id} className="relative aspect-square rounded-xl overflow-hidden bg-slate-100 group border border-outline-variant/5">
                      <img src={img.imagen_url} alt="Referencia marca" className="w-full h-full object-cover" />
                      <button 
                        onClick={() => handleDeleteIdentidad(img.id, img.imagen_url)}
                        className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white"
                        title="Eliminar imagen"
                      >
                        <span className="material-symbols-outlined text-sm font-black">delete</span>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Analizar Identidad Button */}
            <div className="space-y-3">
              <button
                disabled={analyzingIdentidad || identidades.length === 0 || saldo < 500}
                onClick={handleAnalizarIdentidad}
                className="w-full flex items-center justify-center gap-2 py-3.5 bg-violet-600 text-white font-bold rounded-2xl text-[10px] uppercase tracking-widest hover:brightness-110 active:scale-95 transition-all shadow-lg shadow-violet-500/10 disabled:bg-slate-100 disabled:text-slate-400 disabled:border-slate-200 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
              >
                {analyzingIdentidad ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                    <span>Analizando identidad...</span>
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-base">palette</span>
                    <span>Analizar Identidad (500)</span>
                  </>
                )}
              </button>
            </div>

            {/* Result of the analysis */}
            {analisis && analisis.estilo_descripcion ? (
              <div className="bg-violet-50/50 border border-violet-100/50 rounded-2xl p-5 space-y-2.5 animate-in fade-in duration-300">
                <div className="flex items-center gap-2 text-violet-700">
                  <span className="material-symbols-outlined text-xl">palette</span>
                  <span className="text-[10px] font-black uppercase tracking-widest">Estilo Analizado</span>
                </div>
                <p className="text-xs text-on-surface-variant font-medium leading-relaxed max-h-40 overflow-y-auto no-scrollbar">
                  {analisis.estilo_descripcion}
                </p>
                <div className="text-[9px] text-outline font-bold uppercase tracking-widest pt-2 border-t border-violet-100/30 flex justify-between">
                  <span>Actualizado</span>
                  <span>{new Date(analisis.updated_at).toLocaleString('es-AR')}</span>
                </div>
              </div>
            ) : (
              <div className="bg-slate-50 border border-slate-100 rounded-2xl p-5 text-center space-y-2">
                <span className="material-symbols-outlined text-3xl text-outline/40">info_outline</span>
                <p className="text-xs font-medium text-on-surface-variant leading-normal">
                  Sube imágenes de tu marca (logos, folletos, paleta) y analiza tu identidad visual para que los flyers generados sean consistentes con tu estilo.
                </p>
              </div>
            )}
          </div>

          {/* Prompt Extra Instructions Panel */}
          <div className="bg-surface-container-lowest p-8 rounded-[2.5rem] shadow-sm border border-outline-variant/10 space-y-4">
            <div>
              <h3 className="text-xl font-headline font-extrabold text-on-surface tracking-tight">Instrucciones de Contexto</h3>
              <p className="text-[10px] text-outline font-bold uppercase tracking-wider mt-0.5">Dirige el estilo de la generación IA</p>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">Instrucción Extra</label>
              <textarea 
                value={instruccionExtra}
                onChange={(e) => setInstruccionExtra(e.target.value)}
                rows={4}
                className="w-full bg-surface-container-low border-none rounded-2xl py-3 px-4 text-xs font-bold focus:ring-2 focus:ring-violet-600/20 resize-none transition-all"
                placeholder="Ej: 'Usar tono cercano e informal', 'Enfocarse en folletos y tarjetas personales', 'Promocionar ofertas especiales de imprenta offset'..."
              />
              <p className="text-[9px] text-outline font-bold leading-normal ml-1">
                Estas indicaciones le darán contexto adicional al modelo Gemini al momento de crear propuestas de redacción.
              </p>
            </div>

            <button 
              disabled={savingConfig}
              onClick={handleSaveConfig}
              className="w-full flex items-center justify-center gap-2 py-3 bg-slate-900 text-white font-bold rounded-2xl text-[10px] uppercase tracking-widest hover:bg-violet-600 active:scale-95 transition-all shadow-md shadow-slate-950/10"
            >
              {savingConfig ? (
                <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
              ) : (
                <>
                  <span className="material-symbols-outlined text-sm">save</span>
                  <span>Guardar Instrucciones</span>
                </>
              )}
            </button>
          </div>

          {/* Collapsible Transaction History log */}
          <div className="bg-surface-container-lowest rounded-[2.5rem] shadow-sm border border-outline-variant/10 overflow-hidden">
            <button 
              onClick={() => setIsHistoryCollapsed(!isHistoryCollapsed)}
              className="w-full p-8 flex justify-between items-center hover:bg-slate-50/50 transition-colors"
            >
              <div className="text-left">
                <h3 className="text-lg font-headline font-extrabold text-on-surface tracking-tight">Historial de Créditos</h3>
                <p className="text-[10px] text-outline font-bold uppercase tracking-wider mt-0.5">Auditoría de cargas y consumos</p>
              </div>
              <span className={`material-symbols-outlined transition-transform duration-300 text-on-surface-variant ${!isHistoryCollapsed ? 'rotate-180' : ''}`}>
                keyboard_arrow_down
              </span>
            </button>

            {!isHistoryCollapsed && (
              <div className="border-t border-outline-variant/5">
                {transacc.length === 0 ? (
                  <p className="py-8 text-center text-outline/50 italic text-xs">Aún no hay transacciones registradas</p>
                ) : (
                  <div className="divide-y divide-outline-variant/5 max-h-96 overflow-y-auto no-scrollbar">
                    {transacc.map((tx) => (
                      <div key={tx.id} className="px-8 py-4 flex justify-between items-start gap-4 hover:bg-slate-50/30 transition-colors">
                        <div>
                          <p className="text-xs font-bold text-on-surface leading-tight">{tx.descripcion || 'Sin descripción'}</p>
                          <p className="text-[9px] font-black text-outline uppercase tracking-wider mt-0.5">
                            {tx.tipo === 'carga' ? 'Carga de Saldo' : 'Consumo IA'} • {new Date(tx.created_at).toLocaleString('es-AR')}
                          </p>
                        </div>
                        <span className={`text-xs font-black shrink-0 ${tx.monto >= 0 ? 'text-emerald-600' : 'text-error'}`}>
                          {tx.monto >= 0 ? '+' : ''}${Number(tx.monto).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

        </div>

      </div>

      {/* Cargar Saldo Modal Render */}
      {isCargarOpen && (
        <CargarSaldoModal 
          onClose={() => setIsCargarOpen(false)}
          onSuccess={fetchMarketingData}
        />
      )}

    </div>
  );
};

export default PromotionsPage;
