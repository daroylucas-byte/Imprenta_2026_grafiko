import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { toast } from 'react-hot-toast';
import JobModal from '../components/JobModal';
import BillingModal from '../components/BillingModal';

interface Job {
  id: string;
  descripcion: string;
  estado: string;
  total: number;
  sena: number;
  fecha_entrega: string;
  created_at: string;
  t_clientes?: {
    razon_social: string;
  } | {
    razon_social: string;
  }[];
  t_conf_soportes?: {
    nombre: string;
  };
  t_comprobante_trabajos?: {
    comprobante_id: string;
  }[];
  fecha_vencimiento_presupuesto?: string;
  fecha_pase_produccion?: string;
  fecha_prod_fin?: string;
  fecha_entregado?: string;
}

const KanbanPage: React.FC = () => {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isBillingModalOpen, setIsBillingModalOpen] = useState(false);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [selectedJobId, setSelectedJobId] = useState<string | undefined>(undefined);
  const [viewMode, setViewMode] = useState<'kanban' | 'table'>('kanban');
  const [searchTerm, setSearchTerm] = useState('');
  const [deadlineFilter, setDeadlineFilter] = useState<'all' | 'due_soon' | 'overdue'>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('t_trabajos')
        .select(`
          *,
          t_clientes (razon_social),
          t_conf_soportes (nombre),
          t_comprobante_trabajos (comprobante_id)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setJobs(data || []);
    } catch (error: any) {
      toast.error('Error al cargar trabajos: ' + error.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  const handleMoveJob = async (id: string, newStatus: string) => {
    try {
      const updateData: any = { estado: newStatus };
      
      // Handle timestamps for forward moves
      if (newStatus === 'EN PRODUCCIÓN') updateData.fecha_pase_produccion = new Date().toISOString();
      if (newStatus === 'LISTO PARA ENTREGAR') updateData.fecha_prod_fin = new Date().toISOString();
      if (newStatus === 'ENTREGADOS') updateData.fecha_entregado = new Date().toISOString();

      // Clear timestamps for backward moves
      if (newStatus === 'EN PRODUCCIÓN') updateData.fecha_prod_fin = null;
      if (newStatus === 'LISTO PARA ENTREGAR') {
        // If we are coming back from ENTREGADOS, we should clear fecha_entregado
        updateData.fecha_entregado = null;
      }

      const { error } = await supabase
        .from('t_trabajos')
        .update(updateData)
        .eq('id', id);

      if (error) throw error;
      toast.success(`Trabajo movido a ${newStatus.toLowerCase()}`);
      fetchJobs();
    } catch (error: any) {
      toast.error('Error al mover trabajo: ' + error.message);
    }
  };

  const columns = [
    { 
      title: 'PRESUPUESTADO', 
      status: 'PRESUPUESTADO', 
      color: 'bg-slate-500', 
      next: 'EN PRODUCCIÓN', 
      prev: null, 
      label: 'Aprobar' 
    },
    { 
      title: 'EN PRODUCCIÓN', 
      status: 'EN PRODUCCIÓN', 
      color: 'bg-indigo-500', 
      next: 'LISTO PARA ENTREGAR', 
      prev: 'PRESUPUESTADO', 
      label: 'Finalizar' 
    },
    { 
      title: 'LISTO PARA ENTREGAR', 
      status: 'LISTO PARA ENTREGAR', 
      color: 'bg-amber-500', 
      next: 'ENTREGADOS', 
      prev: 'EN PRODUCCIÓN', 
      label: 'Entregar' 
    },
    { 
      title: 'ENTREGADOS', 
      status: 'ENTREGADOS', 
      color: 'bg-emerald-500', 
      next: null, 
      prev: 'LISTO PARA ENTREGAR', 
      label: '' 
    },
  ];

  const getDueDateStatus = (dateStr: string) => {
    if (!dateStr) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    // Adjust for UTC/Local mismatch if needed, but simple comparison usually works for YYYY-MM-DD
    const [year, month, day] = dateStr.split('-').map(Number);
    const dueDate = new Date(year, month - 1, day);
    dueDate.setHours(0, 0, 0, 0);
    
    const diffTime = dueDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) return 'OVERDUE';
    if (diffDays <= 2) return 'DUE_SOON';
    return null;
  };

  return (
    <div className="p-8 max-w-[1600px] mx-auto space-y-8 animate-in fade-in duration-700 pb-20">
      {/* Top Header Actions */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex bg-surface-container-low p-1.5 rounded-2xl w-fit border border-outline-variant/10">
            <button 
              onClick={() => setViewMode('kanban')}
              className={`flex items-center gap-2 px-6 py-2 rounded-xl text-sm font-bold transition-all ${viewMode === 'kanban' ? 'bg-white text-primary shadow-sm' : 'text-on-surface-variant hover:text-primary'}`}
            >
              <span className="material-symbols-outlined text-[1.2rem]">grid_view</span>
              Kanban
            </button>
            <button 
              onClick={() => setViewMode('table')}
              className={`flex items-center gap-2 px-6 py-2 rounded-xl text-sm font-bold transition-all ${viewMode === 'table' ? 'bg-white text-primary shadow-sm' : 'text-on-surface-variant hover:text-primary'}`}
            >
              <span className="material-symbols-outlined text-[1.2rem]">format_list_bulleted</span>
              Vista Tabla
            </button>
          </div>

          <div className="bg-surface-container-low/50 p-1.5 rounded-2xl border border-outline-variant/10 flex flex-wrap items-center gap-1">
            {/* Deadline Filter */}
            {[
              { id: 'all', label: 'Fechas: TODOS', activeBg: 'bg-white', activeText: 'text-primary' },
              { id: 'overdue', label: 'VENCIDOS', activeBg: 'bg-error', activeText: 'text-white' },
              { id: 'due_soon', label: 'PRÓXIMOS', activeBg: 'bg-amber-500', activeText: 'text-white' }
            ].map(f => {
              const isActive = deadlineFilter === f.id;
              return (
                <button 
                  key={f.id}
                  onClick={() => setDeadlineFilter(f.id as any)}
                  className={`px-5 py-2 rounded-xl text-[10px] font-black tracking-tighter transition-all ${
                    isActive ? `${f.activeBg} ${f.activeText} shadow-sm` : 'text-on-surface-variant hover:text-primary'
                  }`}
                >
                  {f.label}
                </button>
              );
            })}
          </div>

          {/* Status Filter */}
          <div className="bg-surface-container-low/50 p-1.5 rounded-2xl border border-outline-variant/10 flex flex-wrap items-center gap-1">
            <select 
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-transparent border-none text-[10px] font-black uppercase tracking-widest text-on-surface-variant focus:ring-0 cursor-pointer pr-8"
            >
              <option value="all">Estado: TODOS</option>
              <option value="PRESUPUESTADO">PRESUPUESTADO</option>
              <option value="EN PRODUCCIÓN">EN PRODUCCIÓN</option>
              <option value="LISTO PARA ENTREGAR">LISTO PARA ENTREGAR</option>
              <option value="ENTREGADOS">ENTREGADOS</option>
            </select>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-4 w-full xl:w-auto">
          <div className="relative w-full sm:w-72 group">
            <span className="absolute left-5 top-1/2 -translate-y-1/2 material-symbols-outlined text-outline group-focus-within:text-primary transition-colors">search</span>
            <input 
              type="text" 
              placeholder="Buscar cliente o pedido..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-surface-container-low border border-outline-variant/5 rounded-2xl py-3 pl-14 pr-6 text-sm font-bold focus:ring-4 focus:ring-primary/10 transition-all outline-none shadow-sm"
            />
          </div>
          <button 
            onClick={() => setIsModalOpen(true)}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-3 bg-primary text-white font-bold rounded-2xl shadow-xl shadow-primary/20 hover:brightness-110 active:scale-95 transition-all text-sm"
          >
            <span className="material-symbols-outlined text-[1.2rem]">add</span>
            Nuevo Trabajo
          </button>
        </div>
      </div>

      {loading ? (
        <div className="h-96 flex flex-col items-center justify-center space-y-4 text-primary/30">
          <div className="w-12 h-12 border-4 border-primary/10 border-t-primary rounded-full animate-spin"></div>
          <p className="text-xs font-black uppercase tracking-widest leading-none">Cargando Tablero...</p>
        </div>
      ) : viewMode === 'kanban' ? (
        /* Kanban Layout - Optimized for Responsiveness */
        <div className="flex gap-8 items-start overflow-x-auto pb-8 -mx-4 px-4 snap-x no-scrollbar">
          {columns.map(col => {
            if (statusFilter !== 'all' && col.status !== statusFilter) return null;

            const colJobs = jobs.filter(j => (j.estado || 'EN PRODUCCIÓN').toUpperCase() === col.status)
                             .filter(j => {
                               const clientName = Array.isArray(j.t_clientes) ? j.t_clientes[0]?.razon_social : j.t_clientes?.razon_social;
                               const matchSearch = (clientName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                                                  j.descripcion.toLowerCase().includes(searchTerm.toLowerCase());
                               return matchSearch;
                             })
                             .filter(j => {
                               if (statusFilter !== 'all' && j.estado !== statusFilter) return false;
                               if (deadlineFilter === 'all') return true;
                               if (j.estado === 'ENTREGADOS') return false;
                               const status = getDueDateStatus(j.fecha_entrega);
                               if (deadlineFilter === 'overdue') return status === 'OVERDUE';
                               if (deadlineFilter === 'due_soon') return status === 'DUE_SOON';
                               return true;
                             });
            
            return (
              <div 
                key={col.status} 
                className="flex-shrink-0 w-[85vw] sm:w-[340px] md:w-[380px] bg-surface-container-low/40 p-6 rounded-[2.5rem] border border-outline-variant/10 min-h-[700px] flex flex-col space-y-6 snap-center"
              >
                <div className="flex items-center justify-between px-2">
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${col.color}`}></div>
                    <h3 className="font-headline font-extrabold text-on-surface text-sm tracking-tight">{col.title}</h3>
                    <span className="px-2.5 py-0.5 bg-white rounded-full text-[10px] font-black text-primary shadow-sm border border-outline-variant/5">
                      {String(colJobs.length).padStart(2, '0')}
                    </span>
                  </div>
                  <button className="material-symbols-outlined text-outline hover:text-primary transition-colors text-xl">more_horiz</button>
                </div>

                <div className="space-y-4 flex-1">
                  {colJobs.map((job) => (
                    <div 
                      key={job.id} 
                      className={`p-6 rounded-3xl shadow-sm border-l-4 transition-all cursor-pointer group animate-in fade-in slide-in-from-bottom-4 duration-300
                        ${col.status === 'EN PRODUCCIÓN' ? 'border-indigo-500 bg-indigo-50/30 hover:shadow-indigo-500/10' : 
                          col.status === 'LISTO PARA ENTREGAR' ? 'border-amber-500 bg-amber-50/30 hover:shadow-amber-500/10' : 
                          'border-emerald-500 bg-emerald-50/30 hover:shadow-emerald-500/10'} 
                        hover:shadow-xl border-t border-r border-b border-outline-variant/10`}
                    >
                      <div className="flex justify-between items-start mb-4">
                         <div className="flex flex-col gap-1.5">
                           <span className="px-2.5 py-1 bg-primary/5 text-primary text-[10px] font-black uppercase tracking-widest rounded-lg w-fit">
                             {job.t_conf_soportes?.nombre || 'General'}
                           </span>
                           {job.t_comprobante_trabajos && job.t_comprobante_trabajos.length > 0 && (
                             <span className="flex items-center gap-1 text-[9px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md w-fit uppercase tracking-tighter">
                               <span className="material-symbols-outlined text-[12px]">verified</span>
                               Facturado
                             </span>
                           )}
                         </div>
                         <div className="flex items-center gap-2">
                           <button 
                             onClick={(e) => {
                               e.stopPropagation();
                               setSelectedJobId(job.id);
                               setIsModalOpen(true);
                             }}
                             className="p-1 hover:bg-primary/10 text-outline hover:text-primary rounded-md transition-all"
                             title="Editar trabajo"
                           >
                              <span className="material-symbols-outlined text-[18px]">edit</span>
                           </button>
                           <span className="text-[10px] font-bold text-outline uppercase tracking-wider">
                             #{job.id.slice(0, 5)}
                           </span>
                         </div>
                      </div>
                      
                      <h4 className="font-headline font-extrabold text-on-surface text-lg leading-tight mb-2 group-hover:text-primary transition-colors">
                        {Array.isArray(job.t_clientes) ? job.t_clientes[0]?.razon_social : job.t_clientes?.razon_social || 'Cliente sin nombre'}
                      </h4>
                      <p className="text-xs text-on-surface-variant font-medium leading-relaxed mb-6 line-clamp-2">
                        {job.descripcion}
                      </p>

                      {/* Counter / Special Labels */}
                      {(job.estado === 'PRESUPUESTADO' || job.estado === 'EN PRODUCCIÓN') && (
                        <div className="mb-4 flex flex-wrap gap-2">
                           {job.estado === 'PRESUPUESTADO' && job.fecha_vencimiento_presupuesto && (
                             <div className="flex items-center gap-1.5 px-3 py-1 bg-error/10 text-error rounded-full border border-error/20">
                                <span className="material-symbols-outlined text-[14px]">event_busy</span>
                                <span className="text-[9px] font-black uppercase tracking-tighter">Vence: {job.fecha_vencimiento_presupuesto.split('-').reverse().join('/')}</span>
                             </div>
                           )}
                           {/* Production Counter: Active during "EN PRODUCCIÓN" and frozen at "LISTO PARA ENTREGAR" */}
                           {(col.status === 'EN PRODUCCIÓN' || col.status === 'LISTO PARA ENTREGAR') && (
                             <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full border ${col.status === 'LISTO PARA ENTREGAR' ? 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20' : 'bg-indigo-500/10 text-indigo-700 border-indigo-500/20'}`}>
                                <span className="material-symbols-outlined text-[14px]">{col.status === 'LISTO PARA ENTREGAR' ? 'verified' : 'timer'}</span>
                                <span className="text-[9px] font-black uppercase tracking-tighter">
                                  {job.fecha_pase_produccion ? (
                                     (() => {
                                       const start = new Date(job.fecha_pase_produccion).getTime();
                                       // If ready, use finish date, otherwise use current date
                                       const end = (col.status === 'LISTO PARA ENTREGAR' && job.fecha_prod_fin) 
                                         ? new Date(job.fecha_prod_fin).getTime() 
                                         : new Date().getTime();
                                       
                                       const days = Math.floor((end - start) / (1000 * 60 * 60 * 24));
                                       return col.status === 'LISTO PARA ENTREGAR' ? `Tardó ${days} días` : `${days} DÍAS EN PROD.`;
                                     })()
                                  ) : 'INICIANDO PROD.'}
                                </span>
                             </div>
                           )}
                        </div>
                      )}
                      
                      <div className="pt-4 border-t border-outline-variant/5 flex items-center justify-between mb-4">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2 text-on-surface-variant">
                            <span className="material-symbols-outlined text-lg">calendar_today</span>
                            <span className="text-[10px] font-bold">{job.fecha_entrega || 'S/D'}</span>
                          </div>
                          {job.estado !== 'ENTREGADOS' && getDueDateStatus(job.fecha_entrega) && (
                            <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-full w-fit tracking-tighter shadow-sm
                              ${getDueDateStatus(job.fecha_entrega) === 'OVERDUE' ? 'bg-error text-white animate-pulse' : 'bg-amber-500 text-white'}`}>
                              {getDueDateStatus(job.fecha_entrega) === 'OVERDUE' ? 'Vencido' : 'Próximo'}
                            </span>
                          )}
                        </div>
                        <div className="flex flex-col items-end">
                          <span className="text-sm font-headline font-black text-on-surface">
                            ${Number(job.total || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                          </span>
                          <div className="flex gap-1.5 mt-0.5">
                            {Number(job.sena || 0) > 0 && (
                              <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">
                                Seña: ${Number(job.sena).toLocaleString('es-AR')}
                              </span>
                            )}
                            <span className="text-[9px] font-bold text-primary bg-primary/5 px-1.5 py-0.5 rounded">
                              Saldo: ${Number((job.total || 0) - (job.sena || 0)).toLocaleString('es-AR')}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Transition Buttons */}
                      <div className="grid grid-cols-5 gap-2">
                        {col.prev && (
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              handleMoveJob(job.id, col.prev!);
                            }}
                            title="Regresar al estado anterior"
                            className="aspect-square bg-surface-container-low hover:bg-error hover:text-white text-outline-variant rounded-xl transition-all flex items-center justify-center border border-outline-variant/5"
                          >
                            <span className="material-symbols-outlined text-lg">undo</span>
                          </button>
                        )}
                        
                        {col.status === 'LISTO PARA ENTREGAR' && (
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedJob(job);
                              setIsBillingModalOpen(true);
                            }}
                            title="Facturar este trabajo"
                            className="aspect-square bg-primary-fixed text-primary hover:bg-primary hover:text-white rounded-xl transition-all flex items-center justify-center border border-primary/10 shadow-sm shadow-primary/5"
                          >
                            <span className="material-symbols-outlined text-lg">receipt_long</span>
                          </button>
                        )}

                        {col.next ? (
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              handleMoveJob(job.id, col.next!);
                            }}
                            className={`${(col.prev || col.status === 'LISTO PARA ENTREGAR') ? 'col-span-4' : 'col-span-5'} py-2 bg-surface-container-low hover:bg-primary hover:text-white text-primary text-[10px] font-black uppercase tracking-[0.1em] rounded-xl transition-all flex items-center justify-center gap-2 group/btn border border-outline-variant/5 h-10`}
                          >
                            <span className="material-symbols-outlined text-lg group-hover/btn:translate-x-1 transition-transform">
                              {col.status === 'EN PRODUCCIÓN' ? 'check_circle' : 'local_shipping'}
                            </span>
                            {col.label}
                          </button>
                        ) : (
                          <div className="col-span-4 py-2 px-4 bg-emerald-50 text-emerald-600 text-[10px] font-black uppercase tracking-[0.1em] rounded-xl border border-emerald-100 flex items-center justify-center gap-2 h-10">
                             <span className="material-symbols-outlined text-lg">verified</span>
                             Entregado
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  
                  {colJobs.length === 0 && (
                    <div className="h-32 border-2 border-dashed border-outline-variant/20 rounded-3xl flex flex-col items-center justify-center text-outline/30 space-y-2">
                      <span className="material-symbols-outlined text-3xl">inbox</span>
                      <p className="text-[10px] font-black uppercase tracking-widest">Sin trabajos</p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-white rounded-[2rem] border border-outline-variant/10 overflow-hidden shadow-sm">
          <div className="overflow-x-auto no-scrollbar">
            <table className="w-full text-left border-collapse min-w-[900px]">
              <thead>
                <tr className="bg-surface-container-low/50">
                  <th className="px-8 py-5 text-[10px] font-black text-on-surface-variant uppercase tracking-widest whitespace-nowrap">Cliente</th>
                  <th className="px-6 py-5 text-[10px] font-black text-on-surface-variant uppercase tracking-widest whitespace-nowrap">Descripción</th>
                  <th className="px-6 py-5 text-[10px] font-black text-on-surface-variant uppercase tracking-widest whitespace-nowrap">Total</th>
                  <th className="px-6 py-5 text-[10px] font-black text-on-surface-variant uppercase tracking-widest text-center whitespace-nowrap">Entrega</th>
                  <th className="px-6 py-5 text-[10px] font-black text-on-surface-variant uppercase tracking-widest text-center whitespace-nowrap">Estado</th>
                  <th className="px-8 py-5 text-[10px] font-black text-on-surface-variant uppercase tracking-widest text-center whitespace-nowrap">Acciones</th>
                </tr>
              </thead>
             <tbody className="divide-y divide-outline-variant/5">
                {jobs.filter(j => {
                  const clientName = Array.isArray(j.t_clientes) ? j.t_clientes[0]?.razon_social : j.t_clientes?.razon_social;
                  return (clientName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                         j.descripcion.toLowerCase().includes(searchTerm.toLowerCase());
                })
                .filter(j => {
                  if (statusFilter !== 'all' && j.estado !== statusFilter) return false;
                  if (deadlineFilter === 'all') return true;
                  if (j.estado === 'ENTREGADOS') return false;
                  const status = getDueDateStatus(j.fecha_entrega);
                  if (deadlineFilter === 'overdue') return status === 'OVERDUE';
                  if (deadlineFilter === 'due_soon') return status === 'DUE_SOON';
                  return true;
                })
                .map(job => {
                  const currentStatus = (job.estado || 'EN PRODUCCIÓN').toUpperCase();
                  const col = columns.find(c => c.status === currentStatus) || columns[0];
                  
                  return (
                    <tr key={job.id} className="hover:bg-surface-container-low transition-colors group">
                      <td className="px-8 py-5">
                         <p className="text-sm font-bold text-on-surface">
                           {Array.isArray(job.t_clientes) ? job.t_clientes[0]?.razon_social : job.t_clientes?.razon_social}
                         </p>
                         <p className="text-[10px] text-outline font-medium">#{job.id.slice(0, 8).toUpperCase()}</p>
                      </td>
                      <td className="px-6 py-5 text-sm text-on-surface-variant max-w-xs truncate">{job.descripcion}</td>
                      <td className="px-6 py-5">
                         <p className="text-sm font-black text-on-surface">${Number(job.total).toLocaleString('es-AR')}</p>
                         {Number(job.sena) > 0 && (
                           <p className="text-[9px] text-emerald-600 font-bold">Seña: ${Number(job.sena).toLocaleString('es-AR')}</p>
                         )}
                      </td>
                      <td className="px-6 py-5 text-center">
                         <p className="text-sm font-medium">{job.fecha_entrega || '---'}</p>
                         {job.estado !== 'ENTREGADOS' && getDueDateStatus(job.fecha_entrega) && (
                           <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-full inline-block mt-1
                             ${getDueDateStatus(job.fecha_entrega) === 'OVERDUE' ? 'bg-error text-white' : 'bg-amber-500 text-white'}`}>
                             {getDueDateStatus(job.fecha_entrega) === 'OVERDUE' ? 'Vencido' : 'Próximo'}
                           </span>
                         )}
                      </td>
                      <td className="px-6 py-5 text-center">
                         <span className={`px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-wider ${col.color.replace('bg-', 'bg-').replace('-500', '/10')} ${col.color.replace('bg-', 'text-').replace('-500', '-700')}`}>
                           {currentStatus}
                         </span>
                      </td>
                      <td className="px-8 py-5">
                         <div className="flex items-center justify-center gap-2">
                            {/* Prev Action */}
                            {col.prev && (
                              <button 
                                onClick={() => handleMoveJob(job.id, col.prev!)}
                                title="Regresar estado"
                                className="p-2 hover:bg-error/10 text-error/60 hover:text-error rounded-lg transition-all"
                              >
                                <span className="material-symbols-outlined text-lg">undo</span>
                              </button>
                            )}
                            
                            {/* Edit Action */}
                            <button 
                              onClick={() => {
                                setSelectedJobId(job.id);
                                setIsModalOpen(true);
                              }}
                              title="Editar trabajo"
                              className="p-2 hover:bg-primary/10 text-primary/60 hover:text-primary rounded-lg transition-all"
                            >
                              <span className="material-symbols-outlined text-lg">edit</span>
                            </button>

                            {/* Billing Action */}
                            {currentStatus === 'LISTO PARA ENTREGAR' && (
                              <button 
                                onClick={() => {
                                  setSelectedJob(job);
                                  setIsBillingModalOpen(true);
                                }}
                                title="Facturar"
                                className="p-2 bg-emerald-500 text-white rounded-lg shadow-sm hover:shadow-md hover:brightness-110 transition-all"
                              >
                                <span className="material-symbols-outlined text-lg">receipt_long</span>
                              </button>
                            )}

                            {/* Next Action */}
                            {col.next && (
                              <button 
                                onClick={() => handleMoveJob(job.id, col.next!)}
                                title={col.label}
                                className="p-2 bg-primary text-white rounded-lg shadow-sm hover:shadow-md hover:brightness-110 transition-all flex items-center justify-center"
                              >
                                <span className="material-symbols-outlined text-lg">
                                  {currentStatus === 'EN PRODUCCIÓN' ? 'check_circle' : 'local_shipping'}
                                </span>
                              </button>
                            )}
                         </div>
                      </td>
                    </tr>
                  );
                })}
             </tbody>
           </table>
          </div>
        </div>
      )}

      {/* Billing Modal */}
      {isBillingModalOpen && selectedJob && (
        <BillingModal 
          job={selectedJob}
          existingInvoiceId={selectedJob.t_comprobante_trabajos?.[0]?.comprobante_id}
          onClose={() => {
            setIsBillingModalOpen(false);
            setSelectedJob(null);
          }}
          onSuccess={fetchJobs}
        />
      )}

      {/* New/Edit Job Modal */}
      {isModalOpen && (
        <JobModal 
          jobId={selectedJobId}
          onClose={() => {
            setIsModalOpen(false);
            setSelectedJobId(undefined);
          }} 
          onSuccess={fetchJobs} 
        />
      )}
    </div>
  );
};

export default KanbanPage;
