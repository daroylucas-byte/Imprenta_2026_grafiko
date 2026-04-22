import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { toast } from 'react-hot-toast';
import { useForm } from 'react-hook-form';

interface JobModalProps {
  jobId?: string;
  onClose: () => void;
  onSuccess: () => void;
}

const JobModal: React.FC<JobModalProps> = ({ jobId, onClose, onSuccess }) => {
  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm();
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  
  // Lookup states
  const [clientes, setClientes] = useState<any[]>([]);
  const [productos, setProductos] = useState<any[]>([]);
  const [soportes, setSoportes] = useState<any[]>([]);
  const [sistemas, setSistemas] = useState<any[]>([]);
  const [tamanios, setTamanios] = useState<any[]>([]);
  const [peliculados, setPeliculados] = useState<any[]>([]);
  const [acabados, setAcabados] = useState<any[]>([]);
  const [terminaciones, setTerminaciones] = useState<any[]>([]);
  const [entregas, setEntregas] = useState<any[]>([]);

  // Local state for items
  const [items, setItems] = useState<any[]>([]);
  const [currentItem, setCurrentItem] = useState<any>({
    producto_id: '',
    cantidad: 1,
    tipo_precio: 'minorista',
    precio_unitario: 0,
    subtotal: 0,
    numeracion_desde: '',
    numeracion_hasta: '',
    fecha_muestra: ''
  });

  useEffect(() => {
    const fetchLookups = async () => {
      try {
        const [
          { data: c }, { data: pList }, { data: s }, { data: si }, { data: t }, 
          { data: p }, { data: a }, { data: tm }, { data: e }
        ] = await Promise.all([
          supabase.from('t_clientes').select('id, razon_social, es_mayorista').order('razon_social'),
          supabase.from('t_productos').select('*').order('nombre'),
          supabase.from('t_conf_soportes').select('id, nombre').order('nombre'),
          supabase.from('t_conf_sistemas_impresion').select('id, nombre').order('nombre'),
          supabase.from('t_conf_tamanios_papel').select('id, nombre').order('nombre'),
          supabase.from('t_conf_peliculados').select('id, nombre').order('nombre'),
          supabase.from('t_conf_acabados').select('id, nombre').order('nombre'),
          supabase.from('t_conf_terminaciones').select('id, nombre').order('nombre'),
          supabase.from('t_conf_tipos_entrega').select('id, nombre').order('nombre'),
        ]);

        setClientes(c || []);
        setProductos(pList || []);
        setSoportes(s || []);
        setSistemas(si || []);
        setTamanios(t || []);
        setPeliculados(p || []);
        setAcabados(a || []);
        setTerminaciones(tm || []);
        setEntregas(e || []);
      } catch (err) {
        toast.error('Error al cargar datos de configuración');
      }
    };
    fetchLookups();
  }, []);

  // Fetch job data if editing
  useEffect(() => {
    if (jobId) {
      const fetchJob = async () => {
        setFetching(true);
        try {
          const { data, error } = await supabase
            .from('t_trabajos')
            .select('*')
            .eq('id', jobId)
            .single();

          if (error) throw error;
          if (data) {
            reset({
              cliente_id: data.cliente_id,
              descripcion: data.descripcion,
              cantidad: data.cantidad,
              fecha_entrega: data.fecha_entrega,
              soporte_id: data.soporte_id || '',
              sistema_impresion_id: data.sistema_impresion_id || '',
              tamanio_papel_id: data.tamanio_papel_id || '',
              peliculado_id: data.peliculado_id || '',
              acabado_id: data.acabado_id || '',
              terminacion_id: data.terminacion_id || '',
              total: data.total,
              sena: data.sena,
              tipo_entrega_id: data.tipo_entrega_id || '',
            });
          }
        } catch (err: any) {
          toast.error('Error al cargar el trabajo: ' + err.message);
        } finally {
          setFetching(false);
        }
      };
      fetchJob();
    }
  }, [jobId, reset]);

  // Handle client selection to default price type
  const handleClientChange = (clientId: string) => {
    const client = clientes.find(c => c.id === clientId);
    if (client) {
      setCurrentItem(prev => ({
        ...prev,
        tipo_precio: client.es_mayorista ? 'mayorista' : 'minorista'
      }));
    }
  };

  // Handle product selection
  const handleProductChange = (productId: string) => {
    const product = productos.find(p => p.id === productId);
    if (product) {
      const price = currentItem.tipo_precio === 'mayorista' ? product.precio_mayorista : product.precio_minorista;
      setCurrentItem(prev => ({
        ...prev,
        producto_id: productId,
        precio_unitario: price,
        subtotal: price * prev.cantidad
      }));
    }
  };

  // Update item quantity or manually override price
  const updateCurrentItem = (updates: any) => {
    setCurrentItem(prev => {
      const next = { ...prev, ...updates };
      // Re-calc subtotal if quantity or unit price changed
      if (updates.cantidad !== undefined || updates.precio_unitario !== undefined || updates.tipo_precio !== undefined) {
        if (updates.tipo_precio) {
          const product = productos.find(p => p.id === next.producto_id);
          if (product) {
            next.precio_unitario = updates.tipo_precio === 'mayorista' ? product.precio_mayorista : product.precio_minorista;
          }
        }
        next.subtotal = (parseFloat(next.precio_unitario) || 0) * (parseFloat(next.cantidad) || 0);
      }
      return next;
    });
  };

  const addItem = () => {
    if (!currentItem.producto_id) {
      toast.error('Seleccione un producto');
      return;
    }
    if (!currentItem.cantidad || currentItem.cantidad <= 0) {
      toast.error('Ingrese una cantidad válida');
      return;
    }
    const product = productos.find(p => p.id === currentItem.producto_id);
    setItems(prev => [...prev, { ...currentItem, nombre: product.nombre, product }]);
    
    // Auto-update form total
    const newTotal = items.reduce((sum, item) => sum + item.subtotal, 0) + currentItem.subtotal;
    setValue('total', newTotal);

    // Reset current item (keep type for convenience)
    setCurrentItem({
      producto_id: '',
      cantidad: 1,
      tipo_precio: currentItem.tipo_precio,
      precio_unitario: 0,
      subtotal: 0,
      numeracion_desde: '',
      numeracion_hasta: '',
      fecha_muestra: ''
    });
  };

  const removeItem = (index: number) => {
    const newItems = items.filter((_, i) => i !== index);
    setItems(newItems);
    const newTotal = newItems.reduce((sum, item) => sum + item.subtotal, 0);
    setValue('total', newTotal);
  };

  const onSubmit = async (data: any) => {
    if (items.length === 0) {
      toast.error('Debe agregar al menos un producto al trabajo');
      return;
    }

    setLoading(true);
    try {
      const { total, sena, ...rest } = data;
      const sanitizedData = Object.entries(rest).reduce((acc: any, [key, value]) => {
        acc[key] = value === "" ? null : value;
        return acc;
      }, { total, sena });

      if (jobId) {
        // Track production entry date if status changes to 'EN PRODUCCIÓN'
        if (data.estado === 'EN PRODUCCIÓN') {
           // We'll check if it was already in production by fetching it or just setting it now if it's null
           // For simplicity in this update:
           sanitizedData.fecha_pase_produccion = new Date().toISOString();
        }
        
        const { error } = await supabase.from('t_trabajos').update(sanitizedData).eq('id', jobId);
        if (error) throw error;
      } else {
        // Create Job then Items
        const { data: job, error: jobErr } = await supabase
          .from('t_trabajos')
          .insert([{
            ...sanitizedData,
            estado: data.estado || 'PRESUPUESTADO',
            fecha_pase_produccion: data.estado === 'EN PRODUCCIÓN' ? new Date().toISOString() : null,
            created_at: new Date().toISOString(),
          }])
          .select()
          .single();

        if (jobErr) throw jobErr;

        // Insert Items
        const itemRows = items.map(item => ({
          trabajo_id: job.id,
          producto_id: item.producto_id,
          cantidad: item.cantidad,
          tipo_precio: item.tipo_precio,
          precio_unitario: item.precio_unitario,
          subtotal: item.subtotal,
          numeracion_desde: item.numeracion_desde || null,
          numeracion_hasta: item.numeracion_hasta || null,
          fecha_muestra: item.fecha_muestra || null
        }));

        const { error: itemsErr } = await supabase.from('t_trabajo_productos').insert(itemRows);
        if (itemsErr) throw itemsErr;
      }

      toast.success(jobId ? 'Trabajo actualizado' : 'Trabajo creado con éxito');
      onSuccess();
      onClose();
    } catch (err: any) {
      toast.error('Error: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300">
      <div className="bg-white w-full max-w-4xl max-h-[90vh] rounded-[2.5rem] shadow-2xl border border-white/20 flex flex-col overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-12 duration-500">
        {/* Header */}
        <div className="px-6 md:px-10 py-6 md:py-8 border-b border-outline-variant/10 flex justify-between items-center bg-surface-container-low/30">
          <div>
            <h3 className="text-2xl md:text-3xl font-headline font-extrabold text-on-surface tracking-tight">
              {jobId ? 'Editar Trabajo' : 'Nuevo Trabajo'}
            </h3>
            <p className="text-[10px] md:text-xs text-on-surface-variant font-bold uppercase tracking-widest mt-1">
              {jobId ? 'Actualizar especificaciones técnicas' : 'Configuración técnica de producción'}
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-error/10 text-on-surface-variant hover:text-error rounded-full transition-colors transition-transform active:scale-90">
            <span className="material-symbols-outlined text-2xl md:text-3xl">close</span>
          </button>
        </div>

        {fetching ? (
          <div className="flex-1 flex flex-col items-center justify-center p-20 space-y-4">
             <div className="w-12 h-12 border-4 border-primary/10 border-t-primary rounded-full animate-spin"></div>
             <p className="text-xs font-black uppercase text-outline/50 tracking-widest">Cargando especificaciones...</p>
          </div>
        ) : (
          /* Form Body */
          <form onSubmit={handleSubmit(onSubmit)} className="flex-1 overflow-y-auto no-scrollbar p-6 md:p-10 space-y-8 md:space-y-12">
            
            {/* Section: General Information */}
            <div className="space-y-6">
              <div className="flex items-center gap-3 text-primary">
                <span className="material-symbols-outlined font-bold">info</span>
                <h4 className="text-sm font-black uppercase tracking-[0.2em]">Información General</h4>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">Estado del Trabajo</label>
                  <select 
                    {...register('estado', { required: true })}
                    className="w-full bg-surface-container-low border-none rounded-2xl py-3 px-4 text-sm font-bold focus:ring-2 focus:ring-primary/20 appearance-none cursor-pointer"
                  >
                    <option value="PRESUPUESTADO">PRESUPUESTADO (Cotización)</option>
                    <option value="EN PRODUCCION">EN PRODUCCIÓN (Aprobado)</option>
                    <option value="DETENIDO">DETENIDO</option>
                  </select>
                </div>
                {watch('estado') === 'PRESUPUESTADO' ? (
                  <div className="space-y-1 animate-in fade-in slide-in-from-top-2 duration-300">
                    <label className="text-[10px] font-black text-error uppercase tracking-widest ml-1 flex items-center gap-1">
                      <span className="material-symbols-outlined text-xs">event_busy</span> Caducidad Presupuesto
                    </label>
                    <input 
                      type="date"
                      {...register('fecha_vencimiento_presupuesto')}
                      className="w-full bg-error/5 border border-error/10 rounded-2xl py-3 px-4 text-sm font-bold focus:ring-2 focus:ring-error/20"
                    />
                  </div>
                ) : (
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">Fecha de Entrega Prometida</label>
                    <input 
                      type="date"
                      {...register('fecha_entrega')}
                      className="w-full bg-surface-container-low border-none rounded-2xl py-3 px-4 text-sm font-bold focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                )}
                
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">Cliente</label>
                  <select 
                    {...register('cliente_id', { required: true })}
                    onChange={(e) => {
                      register('cliente_id').onChange(e);
                      handleClientChange(e.target.value);
                    }}
                    className="w-full bg-surface-container-low border-none rounded-2xl py-3 px-4 text-sm font-bold focus:ring-2 focus:ring-primary/20 appearance-none cursor-pointer"
                  >
                    <option value="">Seleccionar cliente...</option>
                    {clientes.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.razon_social} {c.es_mayorista ? '(M)' : '(m)'}
                      </option>
                    ))}
                  </select>
                  {errors.cliente_id && <p className="text-[10px] text-error font-bold mt-1 ml-1">Requerido</p>}
                </div>

                <div className="space-y-1 md:col-span-2">
                  <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">Descripción General del Proyecto</label>
                  <input 
                    {...register('descripcion', { required: true })}
                    placeholder="Ej: Pedido mensual Editorial..."
                    className="w-full bg-surface-container-low border-none rounded-2xl py-3 px-4 text-sm font-bold focus:ring-2 focus:ring-primary/20 appearance-none"
                  />
                </div>
              </div>
            </div>

            <hr className="border-outline-variant/10" />

            {/* Section: Products List */}
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 text-primary">
                  <span className="material-symbols-outlined font-bold">inventory_2</span>
                  <h4 className="text-sm font-black uppercase tracking-[0.2em]">Productos en el Trabajo</h4>
                </div>
                <div className="px-4 py-1.5 bg-primary/10 rounded-full">
                   <p className="text-[10px] font-black text-primary uppercase">{items.length} ITÉM(S)</p>
                </div>
              </div>

              {/* Add Product Sub-form */}
              <div className="bg-surface-container-lowest p-6 rounded-[2rem] border border-outline-variant/10 space-y-6 shadow-sm">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
                  <div className="md:col-span-5 space-y-1">
                    <label className="text-[9px] font-black text-on-surface-variant uppercase tracking-widest ml-1">Seleccionar Producto</label>
                    <select 
                      value={currentItem.producto_id}
                      onChange={(e) => handleProductChange(e.target.value)}
                      className="w-full bg-surface-container-low border-none rounded-xl py-2.5 px-4 text-sm font-bold focus:ring-2 focus:ring-primary/20 appearance-none cursor-pointer"
                    >
                      <option value="">Buscar producto...</option>
                      {productos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                    </select>
                  </div>
                  <div className="md:col-span-2 space-y-1">
                    <label className="text-[9px] font-black text-on-surface-variant uppercase tracking-widest ml-1">Cantidad</label>
                      <input 
                        type="number"
                        value={currentItem.cantidad}
                        onChange={(e) => updateCurrentItem({ cantidad: e.target.value === '' ? '' : parseInt(e.target.value) })}
                        placeholder="0"
                        className="w-full bg-surface-container-low border-none rounded-xl py-2.5 px-4 text-sm font-bold focus:ring-2 focus:ring-primary/20"
                      />
                  </div>
                  <div className="md:col-span-3 space-y-1">
                    <label className="text-[9px] font-black text-on-surface-variant uppercase tracking-widest ml-1">Precio Unit.</label>
                    <div className="flex bg-surface-container-low rounded-xl overflow-hidden">
                       <select 
                         value={currentItem.tipo_precio}
                         onChange={(e) => updateCurrentItem({ tipo_precio: e.target.value })}
                         className="bg-primary/10 border-none py-2.5 px-2 text-[10px] font-black uppercase text-primary focus:ring-0 appearance-none cursor-pointer"
                       >
                         <option value="minorista">Min</option>
                         <option value="mayorista">May</option>
                       </select>
                        <input 
                         type="number"
                         value={currentItem.precio_unitario}
                         onChange={(e) => updateCurrentItem({ precio_unitario: e.target.value === '' ? '' : parseFloat(e.target.value) })}
                         placeholder="0.00"
                         className="w-full bg-transparent border-none py-2.5 px-3 text-sm font-black focus:ring-0"
                       />
                    </div>
                  </div>
                  <div className="md:col-span-2">
                    <button 
                      type="button"
                      onClick={addItem}
                      className="w-full bg-slate-900 text-white py-2.5 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-primary transition-all active:scale-95"
                    >
                      Añadir
                    </button>
                  </div>
                </div>

                {/* Conditional Fields for current item selection */}
                {(productos.find(p => p.id === currentItem.producto_id)?.requiere_numeracion || productos.find(p => p.id === currentItem.producto_id)?.requiere_fecha_muestra) && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-outline-variant/10 animate-in slide-in-from-top-2 duration-300">
                    {productos.find(p => p.id === currentItem.producto_id)?.requiere_numeracion && (
                      <>
                        <div className="space-y-1">
                          <label className="text-[9px] font-black text-amber-600 uppercase tracking-widest ml-1 flex items-center gap-1">
                            <span className="material-symbols-outlined text-xs">123</span> Desde
                          </label>
                          <input 
                            value={currentItem.numeracion_desde}
                            onChange={(e) => updateCurrentItem({ numeracion_desde: e.target.value })}
                            placeholder="0001"
                            className="w-full bg-amber-50/50 border border-amber-200/30 rounded-xl py-2 px-4 text-xs font-bold focus:ring-2 focus:ring-amber-200"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[9px] font-black text-amber-600 uppercase tracking-widest ml-1 flex items-center gap-1">
                            <span className="material-symbols-outlined text-xs">123</span> Hasta
                          </label>
                          <input 
                            value={currentItem.numeracion_hasta}
                            onChange={(e) => updateCurrentItem({ numeracion_hasta: e.target.value })}
                            placeholder="0500"
                            className="w-full bg-amber-50/50 border border-amber-200/30 rounded-xl py-2 px-4 text-xs font-bold focus:ring-2 focus:ring-amber-200"
                          />
                        </div>
                      </>
                    )}
                    {productos.find(p => p.id === currentItem.producto_id)?.requiere_fecha_muestra && (
                      <div className="space-y-1">
                        <label className="text-[9px] font-black text-blue-600 uppercase tracking-widest ml-1 flex items-center gap-1">
                          <span className="material-symbols-outlined text-xs">calendar_today</span> Fecha Muestra
                        </label>
                        <input 
                          type="date"
                          value={currentItem.fecha_muestra}
                          onChange={(e) => updateCurrentItem({ fecha_muestra: e.target.value })}
                          className="w-full bg-blue-50/50 border border-blue-200/30 rounded-xl py-2 px-4 text-xs font-bold focus:ring-2 focus:ring-blue-200"
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Items Table */}
              {items.length > 0 && (
                <div className="overflow-hidden rounded-3xl border border-outline-variant/10">
                  <table className="w-full text-left bg-surface-container-low/20">
                    <thead className="bg-surface-container-low text-[9px] font-black uppercase text-on-surface-variant tracking-widest">
                      <tr>
                        <th className="px-6 py-3">Producto</th>
                        <th className="px-4 py-3 text-center">Cant.</th>
                        <th className="px-4 py-3 text-right">Unit.</th>
                        <th className="px-4 py-3 text-right">Subtotal</th>
                        <th className="px-4 py-3 text-center">Config</th>
                        <th className="px-6 py-3 text-center"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-outline-variant/5">
                      {items.map((item, idx) => (
                        <tr key={idx} className="text-xs font-bold text-on-surface">
                          <td className="px-6 py-4">
                            <p>{item.nombre}</p>
                            <p className="text-[8px] uppercase text-outline">{item.tipo_precio}</p>
                          </td>
                          <td className="px-4 py-4 text-center">{item.cantidad}</td>
                          <td className="px-4 py-4 text-right">$ {item.precio_unitario.toLocaleString('es-AR')}</td>
                          <td className="px-4 py-4 text-right font-black">$ {item.subtotal.toLocaleString('es-AR')}</td>
                          <td className="px-4 py-4">
                            <div className="flex justify-center gap-1">
                               {item.numeracion_desde && <span title="Num" className="w-2 h-2 rounded-full bg-amber-400"></span>}
                               {item.fecha_muestra && <span title="Muestra" className="w-2 h-2 rounded-full bg-blue-400"></span>}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <button 
                              type="button" 
                              onClick={() => removeItem(idx)}
                              className="text-error hover:scale-125 transition-transform"
                            >
                              <span className="material-symbols-outlined text-[18px]">delete_forever</span>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Section: Technical Specs (Global for the work) */}
            <div className="space-y-6">
              <div className="flex items-center gap-3 text-primary">
                <span className="material-symbols-outlined font-bold">settings_input_component</span>
                <h4 className="text-sm font-black uppercase tracking-[0.2em]">Especificaciones Técnicas Globales</h4>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">Soporte</label>
                  <select {...register('soporte_id')} className="w-full bg-surface-container-low border-none rounded-2xl py-3 px-4 text-sm font-bold focus:ring-2 focus:ring-primary/20 appearance-none">
                    <option value="">Ninguno</option>
                    {soportes.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">Sistema Impresión</label>
                  <select {...register('sistema_impresion_id')} className="w-full bg-surface-container-low border-none rounded-2xl py-3 px-4 text-sm font-bold focus:ring-2 focus:ring-primary/20 appearance-none">
                    <option value="">Ninguno</option>
                    {sistemas.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">Tamaño Papel</label>
                  <select {...register('tamanio_papel_id')} className="w-full bg-surface-container-low border-none rounded-2xl py-3 px-4 text-sm font-bold focus:ring-2 focus:ring-primary/20 appearance-none">
                    <option value="">Ninguno</option>
                    {tamanios.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">Peliculado</label>
                  <select {...register('peliculado_id')} className="w-full bg-surface-container-low border-none rounded-2xl py-3 px-4 text-sm font-bold focus:ring-2 focus:ring-primary/20 appearance-none">
                    <option value="">Ninguno</option>
                    {peliculados.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">Acabado</label>
                  <select {...register('acabado_id')} className="w-full bg-surface-container-low border-none rounded-2xl py-3 px-4 text-sm font-bold focus:ring-2 focus:ring-primary/20 appearance-none">
                    <option value="">Ninguno</option>
                    {acabados.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">Terminación</label>
                  <select {...register('terminacion_id')} className="w-full bg-surface-container-low border-none rounded-2xl py-3 px-4 text-sm font-bold focus:ring-2 focus:ring-primary/20 appearance-none">
                    <option value="">Ninguno</option>
                    {terminaciones.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                  </select>
                </div>
                <div className="space-y-1 md:col-span-3">
                  <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">Tipo Entrega</label>
                  <select {...register('tipo_entrega_id')} className="w-full bg-surface-container-low border-none rounded-2xl py-3 px-4 text-sm font-bold focus:ring-2 focus:ring-primary/20 appearance-none">
                    <option value="">Seleccionar...</option>
                    {entregas.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
                  </select>
                </div>
              </div>
            </div>

            <hr className="border-outline-variant/10" />

            {/* Section: Financials */}
            <div className="space-y-6">
              <div className="flex items-center gap-3 text-primary">
                <span className="material-symbols-outlined font-bold">payments</span>
                <h4 className="text-sm font-black uppercase tracking-[0.2em]">Totales y Pagos</h4>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="p-6 bg-primary/5 rounded-[2rem] border border-primary/10 flex flex-col items-center justify-center space-y-2">
                   <p className="text-[10px] font-black text-primary uppercase tracking-widest">Total del Trabajo</p>
                   <p className="text-4xl font-black text-on-surface">$ {watch('total')?.toLocaleString('es-AR') || '0'}</p>
                   <input type="hidden" {...register('total')} />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">Seña Recibida (AR$)</label>
                  <input 
                    type="number"
                    step="0.01"
                    {...register('sena', { valueAsNumber: true })}
                    placeholder="0.00"
                    className="w-full h-full bg-surface-container-low border-none rounded-[2rem] py-3 px-8 text-2xl font-black focus:ring-2 focus:ring-primary/30"
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
                <span className="material-symbols-outlined">{jobId ? 'save' : 'save'}</span>
                <span>{jobId ? 'Guardar Cambios' : 'Crear Trabajo'}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default JobModal;
