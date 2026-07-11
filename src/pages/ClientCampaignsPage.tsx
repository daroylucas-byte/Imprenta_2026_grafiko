import React, { useState, useEffect, useCallback } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { toast } from 'react-hot-toast';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';

// TypeScript Interfaces
interface Cliente {
  id: string;
  razon_social: string;
}

interface IdentidadVisualCliente {
  id: string;
  cliente_id: string;
  imagen_url: string;
  descripcion: string | null;
  created_at: string;
}

interface AnalisisIdentidadCliente {
  id: string;
  cliente_id: string;
  estilo_descripcion: string;
  updated_at: string;
}

interface PilarSemanal {
  semana: number;
  eje: string;
  enfoque: string;
}

interface CampanaCliente {
  id: string;
  cliente_id: string;
  nombre_campana: string;
  fecha_inicio: string;
  fecha_fin: string;
  objetivo: 'awareness' | 'leads' | 'ventas' | 'engagement' | 'trafico';
  meta_cuantificable: string | null;
  plataformas: string[];
  publico_objetivo: string | null;
  contexto_extra: string | null;
  pilares_semanales: PilarSemanal[] | null;
  estado: 'borrador' | 'activa' | 'archivada';
  created_at: string;
}

interface CampanaPost {
  id: string;
  campana_id: string;
  semana: number;
  fecha: string | null;
  plataforma: string | null;
  tipo_contenido: 'carousel' | 'reel' | 'video' | 'imagen' | 'story' | null;
  hora_sugerida: string | null;
  hook: string | null;
  copy: string | null;
  cta: string | null;
  hashtags: string[] | null;
  objetivo_post: 'awareness' | 'engagement' | 'conversion' | 'retencion' | null;
  imagen_url: string | null;
  estado: 'pendiente' | 'aprobada' | 'rechazada';
  created_at: string;
}

interface CampaignFormInput {
  nombre_campana: string;
  fecha_inicio: string;
  fecha_fin: string;
  objetivo: 'awareness' | 'leads' | 'ventas' | 'engagement' | 'trafico';
  meta_cuantificable: string;
  plataformas: string[];
  publico_objetivo: string;
  contexto_extra: string;
}

const PLATFORMS_OPTIONS = ['Instagram', 'Facebook', 'LinkedIn', 'TikTok', 'Twitter/X', 'YouTube'];

const ClientCampaignsPage: React.FC = () => {
  const { user } = useAuthStore();
  const userId = user?.id ?? null;

  // General States
  const [loading, setLoading] = useState(false);
  const [saldo, setSaldo] = useState<number>(0);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [searchClienteQuery, setSearchClienteQuery] = useState('');
  const [isSearchingClient, setIsSearchingClient] = useState(false);

  // Selected Context States
  const [selectedCliente, setSelectedCliente] = useState<Cliente | null>(null);
  const [identidades, setIdentidades] = useState<IdentidadVisualCliente[]>([]);
  const [analisis, setAnalisis] = useState<AnalisisIdentidadCliente | null>(null);
  const [campanas, setCampanas] = useState<CampanaCliente[]>([]);
  const [selectedCampana, setSelectedCampana] = useState<CampanaCliente | null>(null);
  const [posts, setPosts] = useState<CampanaPost[]>([]);

  // Action Loading States
  const [uploadingImage, setUploadingImage] = useState(false);
  const [analyzingIdentidad, setAnalyzingIdentidad] = useState(false);
  const [creatingCampana, setCreatingCampana] = useState(false);
  const [generatingPlan, setGeneratingPlan] = useState(false);
  const [generatingWeekNum, setGeneratingWeekNum] = useState<number | null>(null);
  const [generatingPostImageId, setGeneratingPostImageId] = useState<string | null>(null);

  // UI States
  const [isNewCampaignOpen, setIsNewCampaignOpen] = useState(false);
  const [activeWeekTab, setActiveWeekTab] = useState<number>(1);

  // React Hook Form for campaign creation
  const { register, handleSubmit, reset, control, formState: { errors } } = useForm<CampaignFormInput>({
    defaultValues: {
      nombre_campana: '',
      fecha_inicio: '',
      fecha_fin: '',
      objetivo: 'awareness',
      meta_cuantificable: '',
      plataformas: [],
      publico_objetivo: '',
      contexto_extra: '',
    }
  });

  // Extract AI summary helper
  const getAiSummaryAndUserContext = (contexto: string | null) => {
    if (!contexto) return { userContext: '', aiSummary: '' };
    const marker = '[Resumen generado por IA]:';
    const index = contexto.indexOf(marker);
    if (index !== -1) {
      return {
        userContext: contexto.substring(0, index).trim(),
        aiSummary: contexto.substring(index + marker.length).trim()
      };
    }
    return { userContext: contexto.trim(), aiSummary: '' };
  };

  // Helper to parse edge function errors
  const handleEdgeFunctionError = async (err: any, fallbackMessage: string) => {
    console.error(err);
    let errorMsg = err.message || fallbackMessage;
    if (err instanceof Error) {
      const context = (err as any).context;
      if (context && typeof context.text === 'function') {
        try {
          const text = await context.text();
          const parsed = JSON.parse(text);
          if (parsed.error) errorMsg = parsed.error;
        } catch (e) {
          try {
            const text = await context.text();
            if (text && text.length < 250) errorMsg = text;
          } catch (e2) {}
        }
      }
    }
    toast.error(errorMsg);
  };

  // Fetch Wallet Balance
  const fetchSaldo = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('t_saldo_marketing')
        .select('saldo')
        .eq('id', 1)
        .maybeSingle();

      if (error) throw error;
      setSaldo(data?.saldo ? Number(data.saldo) : 0);
    } catch (err) {
      console.error('Error fetching marketing wallet balance:', err);
    }
  }, []);

  // Fetch Clients list
  const fetchClientes = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('t_clientes')
        .select('id, razon_social')
        .order('razon_social', { ascending: true });

      if (error) throw error;
      setClientes(data || []);
    } catch (err) {
      console.error('Error fetching clients:', err);
      toast.error('Error al cargar la lista de clientes');
    }
  }, []);

  // Load initial global data
  useEffect(() => {
    fetchSaldo();
    fetchClientes();
  }, [fetchSaldo, fetchClientes]);

  // Fetch visual identity data for selected client
  const fetchIdentidadYAnalisis = useCallback(async (clienteId: string) => {
    try {
      // Fetch visual identity images
      const { data: idData, error: idError } = await supabase
        .from('t_identidad_visual_cliente')
        .select('*')
        .eq('cliente_id', clienteId)
        .order('created_at', { ascending: false });

      if (idError) throw idError;
      setIdentidades(idData || []);

      // Fetch identity analysis
      const { data: anaData, error: anaError } = await supabase
        .from('t_analisis_identidad_cliente')
        .select('*')
        .eq('cliente_id', clienteId)
        .maybeSingle();

      if (anaError) throw anaError;
      setAnalisis(anaData);
    } catch (err: any) {
      console.error('Error fetching visual identity details:', err);
      toast.error('Error al cargar la identidad visual del cliente: ' + err.message);
    }
  }, []);

  // Fetch campaigns for selected client
  const fetchCampanas = useCallback(async (clienteId: string, selectCampanaId?: string) => {
    try {
      const { data, error } = await supabase
        .from('t_campanas_cliente')
        .select('*')
        .eq('cliente_id', clienteId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setCampanas(data || []);

      // Update selected campaign reference if any exists (functional updater
      // para no depender de `selectedCampana` en este callback: dependerlo
      // causaba un loop infinito porque setSelectedCampana recreaba
      // fetchCampanas, que a su vez era dependencia del useEffect que la invoca).
      setSelectedCampana(prev => {
        const targetId = selectCampanaId ?? prev?.id;
        if (!targetId) return prev;
        const found = data?.find(c => c.id === targetId);
        return found ?? (selectCampanaId ? prev : null);
      });
    } catch (err: any) {
      console.error('Error fetching client campaigns:', err);
      toast.error('Error al cargar las campañas del cliente: ' + err.message);
    }
  }, []);

  // Fetch posts for selected campaign
  const fetchPosts = useCallback(async (campanaId: string) => {
    try {
      const { data, error } = await supabase
        .from('t_campana_posts')
        .select('*')
        .eq('campana_id', campanaId)
        .order('semana', { ascending: true })
        .order('created_at', { ascending: true });

      if (error) throw error;
      setPosts(data || []);
    } catch (err: any) {
      console.error('Error fetching campaign posts:', err);
      toast.error('Error al cargar los posts de la campaña: ' + err.message);
    }
  }, []);

  // Whenever selected client changes, fetch their resources
  useEffect(() => {
    if (selectedCliente) {
      setLoading(true);
      Promise.all([
        fetchIdentidadYAnalisis(selectedCliente.id),
        fetchCampanas(selectedCliente.id)
      ]).finally(() => setLoading(false));
      setSelectedCampana(null);
      setPosts([]);
      setIsNewCampaignOpen(false);
    } else {
      setIdentidades([]);
      setAnalisis(null);
      setCampanas([]);
      setSelectedCampana(null);
      setPosts([]);
    }
  }, [selectedCliente, fetchIdentidadYAnalisis, fetchCampanas]);

  // Whenever selected campaign changes, fetch posts
  useEffect(() => {
    if (selectedCampana) {
      fetchPosts(selectedCampana.id);
    } else {
      setPosts([]);
    }
  }, [selectedCampana, fetchPosts]);

  // Handle uploading of client visual identity images
  const handleUploadIdentidad = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !selectedCliente) return;

    setUploadingImage(true);
    const toastId = toast.loading('Subiendo imágenes de identidad...');
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}.${fileExt}`;
        const filePath = `identidad-clientes/${selectedCliente.id}/${fileName}`;

        // 1. Upload to public bucket 'marketing'
        const { error: uploadError } = await supabase.storage
          .from('marketing')
          .upload(filePath, file);

        if (uploadError) throw uploadError;

        // 2. Get public URL
        const { data: { publicUrl } } = supabase.storage
          .from('marketing')
          .getPublicUrl(filePath);

        // 3. Insert record to t_identidad_visual_cliente
        const { error: insertError } = await supabase
          .from('t_identidad_visual_cliente')
          .insert({
            cliente_id: selectedCliente.id,
            imagen_url: publicUrl,
            descripcion: file.name
          });

        if (insertError) throw insertError;
      }

      toast.success('Imágenes cargadas correctamente', { id: toastId });
      await fetchIdentidadYAnalisis(selectedCliente.id);
    } catch (err: any) {
      console.error('Error uploading client visual identity images:', err);
      toast.error('Error al subir imágenes: ' + err.message, { id: toastId });
    } finally {
      setUploadingImage(false);
      e.target.value = '';
    }
  };

  // Delete visual identity image
  const handleDeleteIdentidad = async (id: string, imageUrl: string) => {
    if (!selectedCliente) return;
    const toastId = toast.loading('Eliminando imagen...');
    try {
      const { error: deleteError } = await supabase
        .from('t_identidad_visual_cliente')
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
      await fetchIdentidadYAnalisis(selectedCliente.id);
    } catch (err: any) {
      console.error('Error deleting visual identity image:', err);
      toast.error('Error al eliminar imagen: ' + err.message, { id: toastId });
    }
  };

  // Invoke analizar-identidad-cliente Edge Function
  const handleAnalizarIdentidad = async () => {
    if (!selectedCliente) return;
    if (identidades.length === 0) {
      toast.error('No hay imágenes de referencia cargadas para este cliente.');
      return;
    }
    if (saldo < 500) {
      toast.error('Saldo insuficiente para analizar identidad visual.');
      return;
    }

    setAnalyzingIdentidad(true);
    const toastId = toast.loading('Analizando identidad visual del cliente con Gemini...');
    try {
      const { data, error } = await supabase.functions.invoke('analizar-identidad-cliente', {
        body: { cliente_id: selectedCliente.id, usuario_id: userId }
      });

      if (error) throw error;
      if (data && data.error) throw new Error(data.error);

      toast.success('¡Identidad visual analizada correctamente!', { id: toastId });
      await fetchIdentidadYAnalisis(selectedCliente.id);
      await fetchSaldo();
    } catch (err: any) {
      await handleEdgeFunctionError(err, 'Error al analizar la identidad visual');
      toast.dismiss(toastId);
    } finally {
      setAnalyzingIdentidad(false);
    }
  };

  // Create campaign form submission
  const onSubmitCampaign = async (data: CampaignFormInput) => {
    if (!selectedCliente) return;
    if (saldo < 600) {
      toast.error('Saldo insuficiente para crear y generar una campaña.');
      return;
    }

    setCreatingCampana(true);
    const toastId = toast.loading('Guardando borrador de campaña...');
    try {
      // 1. Insert campaign record in 't_campanas_cliente' as 'borrador'
      const { data: newCamp, error: insertError } = await supabase
        .from('t_campanas_cliente')
        .insert({
          cliente_id: selectedCliente.id,
          nombre_campana: data.nombre_campana,
          fecha_inicio: data.fecha_inicio || null,
          fecha_fin: data.fecha_fin || null,
          objetivo: data.objetivo,
          meta_cuantificable: data.meta_cuantificable || null,
          plataformas: data.plataformas || [],
          publico_objetivo: data.publico_objetivo || null,
          contexto_extra: data.contexto_extra || null,
          estado: 'borrador',
        })
        .select()
        .single();

      if (insertError) throw insertError;

      toast.loading('Generando plan estratégico con IA (600 créditos)...', { id: toastId });

      // 2. Invoke 'generar-campana' Edge Function
      const { data: genData, error: genError } = await supabase.functions.invoke('generar-campana', {
        body: { campana_id: newCamp.id, usuario_id: userId }
      });

      if (genError) throw genError;
      if (genData && genData.error) throw new Error(genData.error);

      toast.success('¡Campaña y plan estratégico creados con éxito!', { id: toastId });
      reset();
      setIsNewCampaignOpen(false);
      
      // Refresh list and select the new campaign
      await fetchCampanas(selectedCliente.id, newCamp.id);
      await fetchSaldo();
    } catch (err: any) {
      await handleEdgeFunctionError(err, 'Error al crear la campaña');
      toast.dismiss(toastId);
      // Refresh campaign list anyway to see if the draft was saved
      await fetchCampanas(selectedCliente.id);
    } finally {
      setCreatingCampana(false);
    }
  };

  // Generate Plan (when campaign is in borrador and needs to retry)
  const handleGenerarPlan = async (campanaId: string) => {
    if (saldo < 600) {
      toast.error('Saldo insuficiente para generar plan de campaña.');
      return;
    }

    setGeneratingPlan(true);
    const toastId = toast.loading('Generando plan estratégico de campaña...');
    try {
      const { data, error } = await supabase.functions.invoke('generar-campana', {
        body: { campana_id: campanaId, usuario_id: userId }
      });

      if (error) throw error;
      if (data && data.error) throw new Error(data.error);

      toast.success('¡Plan de campaña generado correctamente!', { id: toastId });
      if (selectedCliente) {
        await fetchCampanas(selectedCliente.id, campanaId);
      }
      await fetchSaldo();
    } catch (err: any) {
      await handleEdgeFunctionError(err, 'Error al generar el plan de campaña');
      toast.dismiss(toastId);
    } finally {
      setGeneratingPlan(false);
    }
  };

  // Generate week posts
  const handleGenerarSemana = async (semana: number) => {
    if (!selectedCampana) return;
    if (saldo < 600) {
      toast.error('Saldo insuficiente para generar los posts de la semana.');
      return;
    }

    setGeneratingWeekNum(semana);
    const toastId = toast.loading(`Generando posts para la Semana ${semana}...`);
    try {
      const { data, error } = await supabase.functions.invoke('generar-semana-campana', {
        body: { campana_id: selectedCampana.id, semana, usuario_id: userId }
      });

      if (error) throw error;
      if (data && data.error) throw new Error(data.error);

      toast.success(`¡Posts de la Semana ${semana} generados correctamente!`, { id: toastId });
      await fetchPosts(selectedCampana.id);
      await fetchSaldo();
    } catch (err: any) {
      await handleEdgeFunctionError(err, `Error al generar posts de la semana ${semana}`);
      toast.dismiss(toastId);
    } finally {
      setGeneratingWeekNum(null);
    }
  };

  // Generate Image for a specific post
  const handleGenerarImagenPost = async (postId: string) => {
    if (saldo < 1250) {
      toast.error('Saldo insuficiente para generar la imagen del post.');
      return;
    }

    setGeneratingPostImageId(postId);
    const toastId = toast.loading('Generando imagen con Gemini respetando estilo visual...');
    try {
      const { data, error } = await supabase.functions.invoke('generar-imagen-campana', {
        body: { post_id: postId, usuario_id: userId }
      });

      if (error) throw error;
      if (data && data.error) throw new Error(data.error);

      toast.success('¡Imagen del post generada correctamente!', { id: toastId });
      if (selectedCampana) {
        await fetchPosts(selectedCampana.id);
      }
      await fetchSaldo();
    } catch (err: any) {
      await handleEdgeFunctionError(err, 'Error al generar la imagen del post');
      toast.dismiss(toastId);
    } finally {
      setGeneratingPostImageId(null);
    }
  };

  // Update post approval status
  const handleUpdatePostStatus = async (postId: string, nuevoEstado: 'aprobada' | 'rechazada') => {
    try {
      const { error } = await supabase
        .from('t_campana_posts')
        .update({ estado: nuevoEstado })
        .eq('id', postId);

      if (error) throw error;

      toast.success(nuevoEstado === 'aprobada' ? 'Post aprobado' : 'Post rechazado');
      setPosts(prev => prev.map(p => p.id === postId ? { ...p, estado: nuevoEstado } : p));
    } catch (err: any) {
      console.error('Error updating post status:', err);
      toast.error('Error al cambiar estado del post: ' + err.message);
    }
  };

  // Filter clients locally
  const filteredClientes = clientes.filter(c =>
    c.razon_social.toLowerCase().includes(searchClienteQuery.toLowerCase())
  );

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in duration-700">
      
      {/* Paso A: Client Search & Selector (Top bar when client selected, otherwise main screen) */}
      {!selectedCliente ? (
        <div className="max-w-xl mx-auto bg-surface-container-lowest p-10 rounded-[2.5rem] shadow-xl border border-outline-variant/10 flex flex-col items-center space-y-8 text-center mt-12">
          <div className="w-20 h-20 rounded-3xl bg-violet-100 text-violet-700 flex items-center justify-center">
            <span className="material-symbols-outlined text-5xl">groups</span>
          </div>
          <div className="space-y-2">
            <h1 className="text-3xl font-headline font-extrabold text-on-surface tracking-tight">Campañas de Clientes</h1>
            <p className="text-xs text-on-surface-variant font-bold uppercase tracking-widest text-violet-700">Inteligencia Artificial para Clientes de Grafiko</p>
            <p className="text-sm font-medium text-slate-500 max-w-sm mt-2">
              Selecciona un cliente para comenzar a analizar su identidad visual, diseñar planes estratégicos semanales y generar posts automáticos.
            </p>
          </div>

          <div className="w-full relative space-y-2">
            <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1 block text-left">Buscar Cliente</label>
            <div className="relative">
              <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-outline/60">search</span>
              <input
                type="text"
                placeholder="Razón social del cliente..."
                value={searchClienteQuery}
                onFocus={() => setIsSearchingClient(true)}
                onChange={(e) => setSearchClienteQuery(e.target.value)}
                className="w-full bg-surface-container-low border-none rounded-2xl py-4 pl-12 pr-6 text-sm font-bold focus:ring-2 focus:ring-violet-700/20 transition-all shadow-inner"
              />
            </div>

            {/* Suggestions dropdown */}
            {isSearchingClient && (
              <div className="absolute z-50 left-0 right-0 mt-2 bg-white rounded-2xl border border-outline-variant/20 shadow-2xl max-h-60 overflow-y-auto no-scrollbar py-2 text-left animate-in fade-in slide-in-from-top-2 duration-200">
                {filteredClientes.length === 0 ? (
                  <p className="px-6 py-4 text-xs font-bold text-outline italic">No se encontraron clientes</p>
                ) : (
                  filteredClientes.map(c => (
                    <button
                      key={c.id}
                      onClick={() => {
                        setSelectedCliente(c);
                        setIsSearchingClient(false);
                        setSearchClienteQuery('');
                      }}
                      className="w-full px-6 py-3.5 hover:bg-violet-50 text-sm font-bold text-on-surface hover:text-violet-700 transition-colors flex items-center gap-3"
                    >
                      <span className="material-symbols-outlined text-outline/50">person</span>
                      <span>{c.razon_social}</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-8">
          
          {/* Header Panel: Selected Client + Wallet Balance */}
          <div className="flex flex-col md:flex-row gap-6 justify-between items-stretch">
            
            {/* Client Context Panel */}
            <div className="flex-1 bg-surface-container-lowest p-6 md:p-8 rounded-[2rem] border border-outline-variant/10 shadow-sm flex items-center justify-between gap-6 group hover:border-violet-500/20 transition-all">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-violet-100 text-violet-700 flex items-center justify-center">
                  <span className="material-symbols-outlined text-2xl font-bold">campaign</span>
                </div>
                <div>
                  <p className="text-[10px] font-black text-violet-700 uppercase tracking-widest">Campaña de IA activa para:</p>
                  <h2 className="text-2xl font-headline font-extrabold text-on-surface tracking-tight leading-tight mt-0.5">
                    {selectedCliente.razon_social}
                  </h2>
                </div>
              </div>
              
              <button
                onClick={() => setSelectedCliente(null)}
                className="flex items-center gap-1.5 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-on-surface-variant font-bold rounded-xl text-[10px] uppercase tracking-widest transition-all"
              >
                <span className="material-symbols-outlined text-sm">swap_horiz</span>
                <span>Cambiar Cliente</span>
              </button>
            </div>

            {/* Wallet Balance Display */}
            <div className="w-full md:w-80 bg-gradient-to-br from-violet-700 to-indigo-900 px-6 py-5 rounded-[2rem] shadow-xl text-white flex flex-col justify-between relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none transition-transform group-hover:scale-110 duration-500">
                <span className="material-symbols-outlined text-[6rem]">auto_awesome</span>
              </div>
              <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-violet-200">Saldo Inteligencia Artificial</p>
                <h3 className="text-2xl font-headline font-extrabold tracking-tight mt-0.5">
                  ${Number(saldo).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                </h3>
              </div>
              <p className="text-[8px] font-bold text-violet-200/50 uppercase tracking-widest mt-3">
                Wallet corporativa de créditos
              </p>
            </div>

          </div>

          {/* Main Workspace Layout */}
          {loading ? (
            <div className="py-20 flex flex-col items-center justify-center space-y-4 text-violet-300">
              <div className="w-10 h-10 border-4 border-violet-100 border-t-violet-600 rounded-full animate-spin"></div>
              <p className="text-[10px] font-black uppercase tracking-widest">Cargando datos del cliente...</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              
              {/* Left Column (span 4): Paso B & Paso C */}
              <div className="lg:col-span-4 space-y-8">
                
                {/* Paso B: Client Visual Identity */}
                <div className="bg-surface-container-lowest p-6 rounded-[2rem] shadow-sm border border-outline-variant/10 space-y-6">
                  <div>
                    <h3 className="text-lg font-headline font-extrabold text-on-surface tracking-tight">Identidad Visual</h3>
                    <p className="text-[10px] text-outline font-bold uppercase tracking-wider mt-0.5">Guía estética del cliente</p>
                  </div>

                  {/* Thumbnail gallery */}
                  {identidades.length > 0 ? (
                    <div className="space-y-2">
                      <span className="text-[9px] font-black text-on-surface-variant uppercase tracking-widest ml-1 block">Referencias de marca ({identidades.length}/5)</span>
                      <div className="grid grid-cols-5 gap-1.5">
                        {identidades.slice(0, 5).map((img) => (
                          <div key={img.id} className="relative aspect-square rounded-xl overflow-hidden bg-slate-100 group border border-outline-variant/5">
                            <img src={img.imagen_url} alt="Referencia" className="w-full h-full object-cover" />
                            <button
                              onClick={() => handleDeleteIdentidad(img.id, img.imagen_url)}
                              className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white"
                              title="Eliminar"
                            >
                              <span className="material-symbols-outlined text-sm font-black">delete</span>
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 text-center text-xs text-outline/70">
                      Sin imágenes de referencia. Sube logos o piezas viejas.
                    </div>
                  )}

                  {/* Upload input */}
                  {identidades.length < 5 && (
                    <div className="space-y-2">
                      <label className="flex flex-col items-center justify-center border border-dashed border-outline-variant/30 hover:border-violet-500/50 rounded-xl p-4 cursor-pointer bg-slate-50/50 hover:bg-violet-50/20 transition-all text-center group">
                        <span className="material-symbols-outlined text-2xl text-outline/50 group-hover:text-violet-600 transition-colors">cloud_upload</span>
                        <span className="text-[10px] font-bold text-on-surface-variant mt-1 group-hover:text-violet-700">Subir imágenes</span>
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
                  )}

                  {/* Analyze Identity action */}
                  <div className="space-y-3">
                    <button
                      disabled={analyzingIdentidad || identidades.length === 0 || saldo < 500}
                      onClick={handleAnalizarIdentidad}
                      className="w-full flex items-center justify-center gap-2 py-3 bg-violet-600 text-white font-bold rounded-2xl text-[10px] uppercase tracking-widest hover:brightness-110 active:scale-95 transition-all shadow-md shadow-violet-500/10 disabled:bg-slate-100 disabled:text-slate-400 disabled:border-slate-200 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
                    >
                      {analyzingIdentidad ? (
                        <>
                          <div className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                          <span>Analizando...</span>
                        </>
                      ) : (
                        <>
                          <span className="material-symbols-outlined text-sm font-bold">palette</span>
                          <span>Analizar Estilo (500)</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Analysis style report */}
                  {analisis && analisis.estilo_descripcion && (
                    <div className="bg-violet-50/50 border border-violet-100/50 rounded-2xl p-4 space-y-2.5 animate-in fade-in duration-300">
                      <div className="flex items-center gap-1.5 text-violet-700">
                        <span className="material-symbols-outlined text-lg">auto_awesome</span>
                        <span className="text-[9px] font-black uppercase tracking-widest">Perfil de Estilo IA</span>
                      </div>
                      <p className="text-xs text-on-surface-variant font-medium leading-relaxed max-h-36 overflow-y-auto no-scrollbar">
                        {analisis.estilo_descripcion}
                      </p>
                      <div className="text-[8px] text-outline font-bold uppercase tracking-widest pt-2 border-t border-violet-100/30 text-right">
                        Actualizado: {new Date(analisis.updated_at).toLocaleDateString('es-AR')}
                      </div>
                    </div>
                  )}
                </div>

                {/* Paso C: Campaign list & "Nueva Campaña" Button */}
                <div className="bg-surface-container-lowest p-6 rounded-[2rem] shadow-sm border border-outline-variant/10 space-y-6">
                  <div className="flex justify-between items-center">
                    <div>
                      <h3 className="text-lg font-headline font-extrabold text-on-surface tracking-tight">Campañas</h3>
                      <p className="text-[10px] text-outline font-bold uppercase tracking-wider mt-0.5">Historial de campañas</p>
                    </div>

                    <button
                      onClick={() => {
                        setIsNewCampaignOpen(true);
                        setSelectedCampana(null);
                      }}
                      className="p-2 bg-violet-50 hover:bg-violet-100 text-violet-700 rounded-full transition-all"
                      title="Nueva Campaña"
                    >
                      <span className="material-symbols-outlined">add</span>
                    </button>
                  </div>

                  {campanas.length === 0 ? (
                    <div className="py-6 text-center text-xs text-outline italic">
                      No hay campañas para este cliente.
                    </div>
                  ) : (
                    <div className="space-y-2.5 max-h-80 overflow-y-auto no-scrollbar">
                      {campanas.map((c) => {
                        const isSelected = selectedCampana?.id === c.id;
                        return (
                          <button
                            key={c.id}
                            onClick={() => {
                              setSelectedCampana(c);
                              setIsNewCampaignOpen(false);
                            }}
                            className={`w-full text-left p-4 rounded-2xl border transition-all text-xs flex justify-between items-start gap-4 ${
                              isSelected
                                ? 'bg-violet-50 border-violet-200 shadow-md shadow-violet-500/5'
                                : 'bg-slate-50 hover:bg-slate-100 border-outline-variant/5'
                            }`}
                          >
                            <div className="space-y-1">
                              <p className={`font-black ${isSelected ? 'text-violet-700' : 'text-on-surface'}`}>{c.nombre_campana}</p>
                              <p className="text-[9px] text-outline font-semibold uppercase tracking-wider">
                                {c.fecha_inicio ? new Date(c.fecha_inicio).toLocaleDateString('es-AR') : 'S/F'} - {c.fecha_fin ? new Date(c.fecha_fin).toLocaleDateString('es-AR') : 'S/F'}
                              </p>
                            </div>
                            <span className={`px-2 py-0.5 text-[8px] font-black uppercase rounded tracking-widest shrink-0 border ${
                              c.estado === 'activa'
                                ? 'bg-emerald-50 text-emerald-600 border-emerald-100'
                                : c.estado === 'archivada'
                                ? 'bg-slate-100 text-slate-500 border-slate-200'
                                : 'bg-amber-50 text-amber-600 border-amber-100'
                            }`}>
                              {c.estado}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

              </div>

              {/* Right Column (span 8): Detailed panels (Form or Campaign details) */}
              <div className="lg:col-span-8">
                
                {/* Form to Create Campaign (Paso C) */}
                {isNewCampaignOpen && (
                  <div className="bg-surface-container-lowest p-8 md:p-10 rounded-[2.5rem] shadow-sm border border-outline-variant/10 space-y-8 animate-in fade-in duration-300">
                    <div>
                      <h2 className="text-2xl font-headline font-extrabold text-on-surface tracking-tight">Nueva Campaña de Marketing</h2>
                      <p className="text-[10px] text-violet-700 font-black uppercase tracking-widest mt-1">Plan estratégico e ideas de contenido a 30 días</p>
                    </div>

                    <form onSubmit={handleSubmit(onSubmitCampaign)} className="space-y-6">
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-1">
                          <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1 block">Nombre de Campaña *</label>
                          <input
                            type="text"
                            {...register('nombre_campana', { required: true })}
                            placeholder="Ej: Lanzamiento Invierno Grafiko"
                            className="w-full bg-surface-container-low border-none rounded-2xl py-3 px-4 text-sm font-bold focus:ring-2 focus:ring-violet-700/20 transition-all shadow-inner"
                          />
                          {errors.nombre_campana && <p className="text-[10px] text-error font-bold mt-1 ml-1">El nombre es requerido</p>}
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1 block">Objetivo *</label>
                          <select
                            {...register('objetivo', { required: true })}
                            className="w-full bg-surface-container-low border-none rounded-2xl py-3 px-4 text-sm font-bold focus:ring-2 focus:ring-violet-700/20 transition-all shadow-inner"
                          >
                            <option value="awareness">Awareness (Reconocimiento)</option>
                            <option value="leads">Leads (Contactos)</option>
                            <option value="ventas">Ventas (Conversión)</option>
                            <option value="engagement">Engagement (Interacción)</option>
                            <option value="trafico">Tráfico (Visitas Web)</option>
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-1">
                          <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1 block">Fecha Inicio</label>
                          <input
                            type="date"
                            {...register('fecha_inicio')}
                            className="w-full bg-surface-container-low border-none rounded-2xl py-3 px-4 text-sm font-bold focus:ring-2 focus:ring-violet-700/20 transition-all shadow-inner"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1 block">Fecha Fin</label>
                          <input
                            type="date"
                            {...register('fecha_fin')}
                            className="w-full bg-surface-container-low border-none rounded-2xl py-3 px-4 text-sm font-bold focus:ring-2 focus:ring-violet-700/20 transition-all shadow-inner"
                          />
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1 block">Meta Cuantificable (Lo completa el usuario, nunca la IA)</label>
                        <input
                          type="text"
                          {...register('meta_cuantificable')}
                          placeholder="Ej: +500 seguidores, 150 cotizaciones, +20% visitas..."
                          className="w-full bg-surface-container-low border-none rounded-2xl py-3 px-4 text-sm font-bold focus:ring-2 focus:ring-violet-700/20 transition-all shadow-inner"
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1 block">Plataformas de destino</label>
                        <div className="flex flex-wrap gap-4 bg-slate-50 p-4 rounded-2xl border border-outline-variant/5">
                          {PLATFORMS_OPTIONS.map((plat) => (
                            <label key={plat} className="flex items-center gap-2 text-xs font-bold text-on-surface-variant cursor-pointer">
                              <Controller
                                name="plataformas"
                                control={control}
                                render={({ field }) => (
                                  <input
                                    type="checkbox"
                                    checked={field.value?.includes(plat)}
                                    className="rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                                    onChange={(e) => {
                                      const updatedList = e.target.checked
                                        ? [...(field.value || []), plat]
                                        : (field.value || []).filter((item: string) => item !== plat);
                                      field.onChange(updatedList);
                                    }}
                                  />
                                )}
                              />
                              <span>{plat}</span>
                            </label>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1 block">Público Objetivo</label>
                        <input
                          type="text"
                          {...register('publico_objetivo')}
                          placeholder="Ej: Pymes locales, diseñadores independientes, agencias de marketing..."
                          className="w-full bg-surface-container-low border-none rounded-2xl py-3 px-4 text-sm font-bold focus:ring-2 focus:ring-violet-700/20 transition-all shadow-inner"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1 block">Contexto Extra o Pautas adicionales</label>
                        <textarea
                          rows={4}
                          {...register('contexto_extra')}
                          placeholder="Ej: Promocionar impresiones express, folletería de alta gama con laca sectorizada, usar un tono profesional..."
                          className="w-full bg-surface-container-low border-none rounded-2xl py-3 px-4 text-xs font-bold focus:ring-2 focus:ring-violet-700/20 transition-all resize-none shadow-inner"
                        />
                      </div>

                      <div className="flex gap-4 pt-4">
                        <button
                          type="button"
                          onClick={() => setIsNewCampaignOpen(false)}
                          className="flex-1 py-4 bg-white text-on-surface-variant font-bold rounded-2xl hover:bg-slate-100 transition-all border border-outline-variant/20 text-[10px] uppercase tracking-widest"
                        >
                          Cancelar
                        </button>
                        
                        {saldo < 600 ? (
                          <div className="flex-[2]">
                            <button
                              disabled
                              title="Saldo insuficiente, se requieren 600 créditos"
                              className="w-full py-4 bg-slate-100 text-slate-400 font-bold rounded-2xl border border-slate-200 cursor-not-allowed opacity-60 flex items-center justify-center gap-2 text-[10px] uppercase tracking-widest"
                            >
                              <span className="material-symbols-outlined text-base">lock</span>
                              <span>Saldo Insuficiente (Requerido: 600)</span>
                            </button>
                          </div>
                        ) : (
                          <button
                            disabled={creatingCampana}
                            type="submit"
                            className="flex-[2] py-4 bg-violet-600 text-white font-bold rounded-2xl shadow-xl shadow-violet-500/20 hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-2 text-[10px] uppercase tracking-widest"
                          >
                            {creatingCampana ? (
                              <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                            ) : (
                              <>
                                <span className="material-symbols-outlined text-[1.2rem]">auto_awesome</span>
                                <span>Crear y Generar Campaña (600)</span>
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    </form>
                  </div>
                )}

                {/* Paso D: Campaign Detail View */}
                {selectedCampana && !isNewCampaignOpen && (
                  <div className="bg-surface-container-lowest p-8 md:p-10 rounded-[2.5rem] shadow-sm border border-outline-variant/10 space-y-8 animate-in fade-in duration-300">
                    
                    {/* General details head */}
                    <div className="flex flex-wrap items-start justify-between gap-4 pb-6 border-b border-outline-variant/5">
                      <div className="space-y-1">
                        <span className="text-[10px] font-black text-violet-700 uppercase tracking-widest">Módulo IA de Campaña</span>
                        <h2 className="text-3xl font-headline font-extrabold text-on-surface tracking-tight">{selectedCampana.nombre_campana}</h2>
                        
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-2 text-xs font-semibold text-outline">
                          <span className="flex items-center gap-1">
                            <span className="material-symbols-outlined text-sm">target</span>
                            Objetivo: <strong className="text-on-surface-variant font-bold uppercase">{selectedCampana.objetivo}</strong>
                          </span>
                          <span>•</span>
                          <span className="flex items-center gap-1">
                            <span className="material-symbols-outlined text-sm">calendar_month</span>
                            Plan: {selectedCampana.fecha_inicio ? new Date(selectedCampana.fecha_inicio).toLocaleDateString('es-AR') : 'S/F'} - {selectedCampana.fecha_fin ? new Date(selectedCampana.fecha_fin).toLocaleDateString('es-AR') : 'S/F'}
                          </span>
                        </div>
                      </div>

                      <span className={`px-3 py-1.5 text-[9px] font-black uppercase rounded-lg tracking-widest border ${
                        selectedCampana.estado === 'activa'
                          ? 'bg-emerald-50 text-emerald-600 border-emerald-100'
                          : selectedCampana.estado === 'archivada'
                          ? 'bg-slate-100 text-slate-500 border-slate-200'
                          : 'bg-amber-50 text-amber-600 border-amber-100'
                      }`}>
                        {selectedCampana.estado}
                      </span>
                    </div>

                    {/* Meta y Plataformas row */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-50/50 p-6 rounded-[1.5rem] border border-outline-variant/5">
                      <div className="space-y-1">
                        <span className="text-[9px] font-black text-outline uppercase tracking-widest block">Meta Cuantificable</span>
                        <p className="text-xs font-bold text-on-surface-variant">{selectedCampana.meta_cuantificable || 'Ninguna definida por el usuario'}</p>
                      </div>

                      <div className="space-y-1">
                        <span className="text-[9px] font-black text-outline uppercase tracking-widest block">Canales / Plataformas</span>
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          {selectedCampana.plataformas && selectedCampana.plataformas.length > 0 ? (
                            selectedCampana.plataformas.map((p) => (
                              <span key={p} className="bg-slate-200/60 text-on-surface-variant rounded-md px-2 py-0.5 text-[10px] font-bold">
                                {p}
                              </span>
                            ))
                          ) : (
                            <span className="text-xs font-bold text-outline italic">No configuradas</span>
                          )}
                        </div>
                      </div>

                      {selectedCampana.publico_objetivo && (
                        <div className="md:col-span-2 space-y-1 pt-3 border-t border-slate-200/40">
                          <span className="text-[9px] font-black text-outline uppercase tracking-widest block">Público Objetivo</span>
                          <p className="text-xs font-semibold text-on-surface-variant leading-relaxed">{selectedCampana.publico_objetivo}</p>
                        </div>
                      )}
                    </div>

                    {/* Borrador State without pilares_semanales - button to generate plan */}
                    {(!selectedCampana.pilares_semanales || selectedCampana.pilares_semanales.length === 0) ? (
                      <div className="py-12 bg-amber-50/30 rounded-[2rem] border border-dashed border-amber-200 p-8 text-center space-y-4">
                        <span className="material-symbols-outlined text-4xl text-amber-500">warning</span>
                        <div>
                          <h4 className="text-base font-bold text-on-surface">Campaña sin Plan Estratégico Generado</h4>
                          <p className="text-xs text-on-surface-variant mt-1 max-w-md mx-auto leading-normal">
                            La campaña fue guardada pero el plan estratégico digital no se pudo generar (quizás por un fallo del backend, saldo o interrupción). Genera el plan ahora.
                          </p>
                        </div>

                        <div className="pt-2">
                          {saldo < 600 ? (
                            <div className="max-w-xs mx-auto">
                              <button
                                disabled
                                className="w-full flex items-center justify-center gap-2 py-3.5 bg-slate-100 text-slate-400 font-bold rounded-2xl text-[10px] uppercase tracking-widest border border-slate-200 cursor-not-allowed opacity-60"
                              >
                                <span className="material-symbols-outlined text-base">lock</span>
                                <span>Saldo Insuficiente (600)</span>
                              </button>
                            </div>
                          ) : (
                            <button
                              disabled={generatingPlan}
                              onClick={() => handleGenerarPlan(selectedCampana.id)}
                              className="px-8 py-3.5 bg-violet-600 text-white font-bold rounded-2xl text-[10px] uppercase tracking-widest shadow-xl shadow-violet-500/20 hover:brightness-110 active:scale-95 transition-all inline-flex items-center gap-2"
                            >
                              {generatingPlan ? (
                                <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                              ) : (
                                <>
                                  <span className="material-symbols-outlined text-base font-bold">auto_fix_high</span>
                                  <span>Generar Plan de Campaña (600)</span>
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-8">
                        
                        {/* Summary / Resumen Ejecutivo */}
                        {(() => {
                          const { aiSummary } = getAiSummaryAndUserContext(selectedCampana.contexto_extra);
                          if (!aiSummary) return null;
                          return (
                            <div className="bg-violet-50/40 border border-violet-100 rounded-[1.5rem] p-6 md:p-8 space-y-3 relative overflow-hidden animate-in fade-in duration-300">
                              <div className="absolute top-0 right-0 p-6 opacity-[0.03] pointer-events-none">
                                <span className="material-symbols-outlined text-[6rem]">campaign</span>
                              </div>
                              <div className="flex items-center gap-2 text-violet-700">
                                <span className="material-symbols-outlined text-2xl font-bold">auto_awesome</span>
                                <h4 className="text-sm font-black uppercase tracking-widest">Resumen Ejecutivo de Campaña</h4>
                              </div>
                              <p className="text-xs text-on-surface-variant font-medium leading-relaxed whitespace-pre-wrap">
                                {aiSummary}
                              </p>
                            </div>
                          );
                        })()}

                        {/* Weekly Plan & Posts - Tabs navigation */}
                        <div className="space-y-6">
                          <div>
                            <h3 className="text-xl font-headline font-extrabold text-on-surface tracking-tight">Plan Semanal y Posts</h3>
                            <p className="text-[10px] text-outline font-bold uppercase tracking-wider mt-0.5">Control y generación de contenido semana a semana</p>
                          </div>

                          {/* 4 week tabs */}
                          <div className="grid grid-cols-4 gap-2 bg-slate-100 p-1.5 rounded-2xl border border-outline-variant/5">
                            {[1, 2, 3, 4].map((w) => {
                              const isActive = activeWeekTab === w;
                              return (
                                <button
                                  key={w}
                                  onClick={() => setActiveWeekTab(w)}
                                  className={`py-3 text-center rounded-xl transition-all text-xs font-black uppercase tracking-widest ${
                                    isActive
                                      ? 'bg-white text-violet-700 shadow-sm'
                                      : 'text-outline hover:text-on-surface'
                                  }`}
                                >
                                  Semana {w}
                                </button>
                              );
                            })}
                          </div>

                          {/* Selected Week Content */}
                          {(() => {
                            const pilar = selectedCampana.pilares_semanales.find(p => p.semana === activeWeekTab);
                            const weekPosts = posts.filter(p => p.semana === activeWeekTab);
                            
                            return (
                              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                                
                                {/* Pilar Card */}
                                {pilar && (
                                  <div className="bg-violet-50/20 border border-violet-100 rounded-[1.5rem] p-6 grid grid-cols-1 md:grid-cols-4 gap-6 items-center">
                                    <div className={`space-y-2 ${weekPosts.length === 0 ? 'md:col-span-3' : 'md:col-span-4'}`}>
                                      <span className="text-[9px] font-black text-violet-700 uppercase tracking-widest">Semana {activeWeekTab} • Pilar de Comunicación</span>
                                      <h4 className="text-base font-extrabold text-on-surface leading-tight font-headline">Eje: {pilar.eje}</h4>
                                      <p className="text-xs font-medium text-on-surface-variant leading-normal"><strong className="text-[9px] font-black uppercase tracking-widest text-outline">Enfoque:</strong> {pilar.enfoque}</p>
                                    </div>
                                    
                                    {/* Action button if no posts generated */}
                                    {weekPosts.length === 0 && (
                                      <div className="md:col-span-1 flex justify-stretch md:justify-end">
                                        {saldo < 600 ? (
                                          <button
                                            disabled
                                            title="Saldo insuficiente (600)"
                                            className="w-full flex items-center justify-center gap-1.5 px-6 py-3.5 bg-slate-100 text-slate-400 font-bold rounded-2xl text-[10px] uppercase tracking-widest border border-slate-200 cursor-not-allowed opacity-60"
                                          >
                                            <span className="material-symbols-outlined text-sm">lock</span>
                                            <span>Saldo Insuficiente</span>
                                          </button>
                                        ) : (
                                          <button
                                            disabled={generatingWeekNum === activeWeekTab}
                                            onClick={() => handleGenerarSemana(activeWeekTab)}
                                            className="w-full flex items-center justify-center gap-1.5 px-6 py-3.5 bg-violet-600 text-white font-bold rounded-2xl text-[10px] uppercase tracking-widest shadow-xl shadow-violet-500/20 hover:brightness-110 active:scale-95 transition-all"
                                          >
                                            {generatingWeekNum === activeWeekTab ? (
                                              <>
                                                <div className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                                                <span>Generando...</span>
                                              </>
                                            ) : (
                                              <>
                                                <span className="material-symbols-outlined text-sm font-bold">auto_awesome</span>
                                                <span>Generar Posts (600)</span>
                                              </>
                                            )}
                                          </button>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                )}

                                {/* Week Posts List */}
                                {weekPosts.length === 0 ? (
                                  <div className="py-12 border border-dashed border-outline-variant/20 rounded-[1.5rem] text-center text-xs text-outline italic">
                                    No hay posts generados para esta semana aún. Haz clic en "Generar Posts" arriba para crearlos con IA.
                                  </div>
                                ) : (
                                  <div className="space-y-6">
                                    {weekPosts.map((post, idx) => {
                                      // Check if copy contains a weekday prefix
                                      const dayPrefixMatch = post.copy?.match(/^\[(.*?)\]/);
                                      const weekdayText = dayPrefixMatch ? dayPrefixMatch[1] : null;

                                      return (
                                        <div 
                                          key={post.id}
                                          className="bg-white border border-outline-variant/10 rounded-[1.5rem] p-6 md:p-8 space-y-6 shadow-sm hover:shadow-md transition-all duration-300 animate-in fade-in slide-in-from-bottom-3"
                                          style={{ animationDelay: `${idx * 50}ms` }}
                                        >
                                          {/* Post Header */}
                                          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-outline-variant/5 pb-4">
                                            <div className="space-y-1">
                                              <div className="flex flex-wrap items-center gap-2">
                                                {weekdayText ? (
                                                  <span className="bg-violet-100 text-violet-700 rounded-md px-2 py-0.5 text-[9px] font-black uppercase tracking-wider">
                                                    Día: {weekdayText}
                                                  </span>
                                                ) : (
                                                  <span className="bg-slate-100 text-slate-600 rounded-md px-2 py-0.5 text-[9px] font-black uppercase tracking-wider">
                                                    Post #{idx + 1}
                                                  </span>
                                                )}
                                                
                                                <span className="bg-slate-200 text-on-surface-variant rounded-md px-2 py-0.5 text-[9px] font-black uppercase tracking-wider">
                                                  {post.plataforma || 'General'}
                                                </span>

                                                {post.tipo_contenido && (
                                                  <span className="bg-indigo-50 text-indigo-600 border border-indigo-100 rounded-md px-2 py-0.5 text-[9px] font-black uppercase tracking-wider">
                                                    {post.tipo_contenido}
                                                  </span>
                                                )}
                                              </div>
                                              
                                              <div className="flex flex-wrap items-center gap-x-3 text-[10px] text-outline font-semibold uppercase tracking-wider pt-1.5">
                                                {post.hora_sugerida && (
                                                  <span className="flex items-center gap-1">
                                                    <span className="material-symbols-outlined text-xs">schedule</span>
                                                    Hora sugerida: {post.hora_sugerida}
                                                  </span>
                                                )}
                                                {post.objetivo_post && (
                                                  <>
                                                    <span>•</span>
                                                    <span>Objetivo: {post.objetivo_post}</span>
                                                  </>
                                                )}
                                              </div>
                                            </div>

                                            {/* Approval State Badge */}
                                            <span className={`px-2.5 py-1 text-[8px] font-black uppercase rounded-lg tracking-widest border ${
                                              post.estado === 'aprobada'
                                                ? 'bg-emerald-50 text-emerald-600 border-emerald-100'
                                                : post.estado === 'rechazada'
                                                ? 'bg-error/5 text-error border-error/10'
                                                : 'bg-amber-50 text-amber-600 border-amber-100'
                                            }`}>
                                              {post.estado}
                                            </span>
                                          </div>

                                          {/* Post Content: Hook, Copy, CTA, Hashtags */}
                                          <div className="space-y-4">
                                            {post.hook && (
                                              <div className="bg-slate-50/50 p-4 rounded-xl border border-slate-100">
                                                <span className="text-[9px] font-black text-outline uppercase tracking-widest block leading-none mb-1">Hook / Gancho</span>
                                                <p className="text-xs font-bold text-violet-800 leading-normal">"{post.hook}"</p>
                                              </div>
                                            )}

                                            {post.copy && (
                                              <div className="space-y-1">
                                                <span className="text-[9px] font-black text-outline uppercase tracking-widest block">Copy principal</span>
                                                <p className="text-sm text-on-surface-variant font-medium leading-relaxed whitespace-pre-wrap">
                                                  {post.copy}
                                                </p>
                                              </div>
                                            )}

                                            {post.cta && (
                                              <div className="bg-violet-50/30 p-4 rounded-xl border border-violet-100/50 flex items-center gap-3">
                                                <span className="material-symbols-outlined text-violet-600 text-lg">touch_app</span>
                                                <div className="text-xs">
                                                  <span className="text-[8px] font-black text-outline uppercase tracking-widest block leading-none">Llamada a la acción</span>
                                                  <span className="font-bold text-on-surface">{post.cta}</span>
                                                </div>
                                              </div>
                                            )}

                                            {post.hashtags && post.hashtags.length > 0 && (
                                              <div className="flex flex-wrap gap-1.5 pt-2">
                                                {post.hashtags.map((tag, tIdx) => (
                                                  <span key={tIdx} className="bg-slate-100 text-slate-600 rounded-lg px-2.5 py-0.5 text-[10px] font-bold">
                                                    #{tag.replace(/^#/, '')}
                                                  </span>
                                                ))}
                                              </div>
                                            )}
                                          </div>

                                          {/* Post Image Showcase */}
                                          {post.imagen_url && (
                                            <div className="relative group rounded-2xl overflow-hidden border border-outline-variant/10 shadow-sm max-w-md bg-slate-50 aspect-video flex items-center justify-center">
                                              <img
                                                src={post.imagen_url}
                                                alt="Post visual asset"
                                                className="w-full h-full object-cover group-hover:scale-[1.01] transition-transform duration-500"
                                                onError={(e) => {
                                                  console.error(`Error loading image URL: ${post.imagen_url}`, e);
                                                  toast.error('Error al renderizar el flyer del post');
                                                }}
                                              />
                                              <div className="absolute bottom-3 right-3 flex gap-2">
                                                <a
                                                  href={post.imagen_url}
                                                  target="_blank"
                                                  rel="noreferrer"
                                                  className="bg-black/70 hover:bg-black/90 text-white rounded-xl px-3 py-1.5 text-[9px] font-black uppercase tracking-widest flex items-center gap-1 backdrop-blur-sm transition-all"
                                                >
                                                  <span className="material-symbols-outlined text-xs">open_in_new</span>
                                                  <span>Ver</span>
                                                </a>

                                                <a
                                                  href={post.imagen_url}
                                                  download={`post-flyer-${post.id}.png`}
                                                  target="_blank"
                                                  rel="noreferrer"
                                                  className="bg-black/70 hover:bg-black/90 text-white rounded-xl px-3 py-1.5 text-[9px] font-black uppercase tracking-widest flex items-center gap-1 backdrop-blur-sm transition-all"
                                                >
                                                  <span className="material-symbols-outlined text-xs">download</span>
                                                  <span>Bajar</span>
                                                </a>
                                              </div>
                                            </div>
                                          )}

                                          {/* Action Buttons: Status Updates & Image Generation */}
                                          <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-outline-variant/5">
                                            
                                            {/* Approval buttons */}
                                            {post.estado === 'pendiente' ? (
                                              <div className="flex gap-2">
                                                <button
                                                  onClick={() => handleUpdatePostStatus(post.id, 'rechazada')}
                                                  className="flex items-center gap-1 px-3.5 py-2 bg-white text-error font-bold rounded-xl text-[9px] uppercase tracking-widest hover:bg-error/5 border border-error/20 transition-all active:scale-95"
                                                >
                                                  <span className="material-symbols-outlined text-xs font-black">close</span>
                                                  <span>Rechazar</span>
                                                </button>

                                                <button
                                                  onClick={() => handleUpdatePostStatus(post.id, 'aprobada')}
                                                  className="flex items-center gap-1 px-4.5 py-2 bg-emerald-600 text-white font-bold rounded-xl text-[9px] uppercase tracking-widest hover:brightness-110 transition-all active:scale-95 shadow-md shadow-emerald-500/10"
                                                >
                                                  <span className="material-symbols-outlined text-xs font-black">check</span>
                                                  <span>Aprobar</span>
                                                </button>
                                              </div>
                                            ) : (
                                              <div className="flex items-center gap-1.5 text-outline/50 text-[9px] font-black uppercase tracking-widest">
                                                {post.estado === 'aprobada' ? (
                                                  <>
                                                    <span className="material-symbols-outlined text-emerald-600 font-black text-base">task_alt</span>
                                                    <span>Post Aprobado</span>
                                                  </>
                                                ) : (
                                                  <>
                                                    <span className="material-symbols-outlined text-error font-black text-base">cancel</span>
                                                    <span>Post Rechazado</span>
                                                  </>
                                                )}
                                              </div>
                                            )}

                                            {/* AI Image Generation Button */}
                                            <button
                                              disabled={generatingPostImageId !== null || saldo < 1250}
                                              onClick={() => handleGenerarImagenPost(post.id)}
                                              className={`flex items-center gap-1 px-3.5 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all active:scale-95 ${
                                                post.imagen_url
                                                  ? 'bg-slate-900 text-white hover:bg-violet-600 shadow-md shadow-slate-900/10'
                                                  : 'bg-violet-100 text-violet-700 hover:bg-violet-600 hover:text-white'
                                              }`}
                                            >
                                              {generatingPostImageId === post.id ? (
                                                <>
                                                  <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
                                                  <span>Generando Imagen...</span>
                                                </>
                                              ) : (
                                                <>
                                                  <span className="material-symbols-outlined text-xs font-bold">auto_fix_high</span>
                                                  <span>{post.imagen_url ? 'Regenerar Imagen (1250)' : 'Generar Imagen (1250)'}</span>
                                                </>
                                              )}
                                            </button>

                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}

                              </div>
                            );
                          })()}

                        </div>

                      </div>
                    )}

                  </div>
                )}

                {/* Initial Screen state when client is selected but no campaign or form is active */}
                {!selectedCampana && !isNewCampaignOpen && (
                  <div className="bg-surface-container-lowest p-10 rounded-[2.5rem] shadow-sm border border-outline-variant/10 flex flex-col items-center justify-center text-center space-y-6 min-h-[50vh] animate-in fade-in duration-300">
                    <div className="w-16 h-16 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center">
                      <span className="material-symbols-outlined text-3xl">campaign</span>
                    </div>
                    <div>
                      <h3 className="text-lg font-headline font-extrabold text-on-surface">Campañas del Cliente</h3>
                      <p className="text-xs text-on-surface-variant font-medium max-w-sm mt-1 mx-auto leading-normal">
                        Selecciona una campaña de la lista de la izquierda para ver su detalle, plan semanal y publicaciones. Si no tiene ninguna, puedes crear una nueva campaña presionando el botón "+".
                      </p>
                    </div>

                    <div className="pt-2">
                      <button
                        onClick={() => setIsNewCampaignOpen(true)}
                        className="flex items-center gap-1.5 px-6 py-3 bg-violet-600 text-white font-bold rounded-xl text-[10px] uppercase tracking-widest shadow-lg shadow-violet-500/10 hover:brightness-110 active:scale-95 transition-all"
                      >
                        <span className="material-symbols-outlined text-sm font-bold">add</span>
                        <span>Nueva Campaña</span>
                      </button>
                    </div>
                  </div>
                )}

              </div>

            </div>
          )}

        </div>
      )}

    </div>
  );
};

export default ClientCampaignsPage;
