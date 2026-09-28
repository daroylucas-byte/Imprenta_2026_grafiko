import React, { useState, useEffect, useCallback } from 'react';
import { todayAR } from '../utils/dates';
import { supabase } from '../lib/supabase';
import { toast } from 'react-hot-toast';
import JobModal from '../components/JobModal';
import BillingModal from '../components/BillingModal';
import JobCompletionPaymentModal from '../components/JobCompletionPaymentModal';
import { printJobVoucher } from '../utils/printJob';
import { useAuthStore } from '../store/authStore';

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
  facturado?: boolean;
  saldo_pendiente?: number;
  total_pagado_directo?: number;
  total_aplicado_cc?: number;
}

const SPEC_FIELDS = [
  // color: clase Tailwind literal (el JIT necesita ver el nombre completo en el archivo)
  { key: 'soporte_id', label: 'Soporte', table: 't_conf_soportes', color: 'bg-indigo-500' },
  { key: 'sistema_impresion_id', label: 'Sistema', table: 't_conf_sistemas_impresion', color: 'bg-emerald-500' },
  { key: 'tamanio_papel_id', label: 'Tamaño', table: 't_conf_tamanios_papel', color: 'bg-amber-500' },
  { key: 'peliculado_id', label: 'Peliculado', table: 't_conf_peliculados', color: 'bg-rose-500' },
  { key: 'acabado_id', label: 'Acabado', table: 't_conf_acabados', color: 'bg-sky-500' },
  { key: 'terminacion_id', label: 'Terminación', table: 't_conf_terminaciones', color: 'bg-violet-500' },
  { key: 'tipo_entrega_id', label: 'Entrega', table: 't_conf_tipos_entrega', color: 'bg-slate-500' },
] as const;

type JobSpec = { label: string; nombre: string | null; color: string };

const KanbanPage: React.FC = () => {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isBillingModalOpen, setIsBillingModalOpen] = useState(false);
  const { user } = useAuthStore();
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [selectedJobId, setSelectedJobId] = useState<string | undefined>(undefined);
  const [viewMode, setViewMode] = useState<'kanban' | 'table'>('table');
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [sortKey, setSortKey] = useState<'cliente' | 'total' | 'fecha' | 'fecha_entrega' | 'estado'>('fecha');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const [deadlineFilter, setDeadlineFilter] = useState<'all' | 'due_soon' | 'overdue'>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [pendingOnly, setPendingOnly] = useState(false);
  const [specNames, setSpecNames] = useState<Record<string, string>>({});
  // Tooltip con position:fixed porque el contenedor de la tabla tiene overflow-x-auto y recortaría uno absoluto
  const [specTip, setSpecTip] = useState<{ x: number; y: number; specs: JobSpec[] } | null>(null);
  const [completionPayment, setCompletionPayment] = useState<{ job: Job; targetStatus: string } | null>(null);

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    try {
      // Use v_saldo_trabajos instead of t_trabajos to get balances
      const { data, error } = await supabase
        .from('v_saldo_trabajos')
        .select('*')
        .filter('estado', 'not.in', '(CANCELADO,ANULADO)')
        .order('fecha_aprobacion', { ascending: false });

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

  // Nombres de las especificaciones técnicas (id -> nombre) para la columna "Specs" de la vista Tabla.
  // Los ids son uuid, así que un solo mapa alcanza para las 7 tablas de configuración.
  useEffect(() => {
    const loadSpecNames = async () => {
      const results = await Promise.all(SPEC_FIELDS.map(f => supabase.from(f.table).select('id, nombre')));
      const map: Record<string, string> = {};
      results.forEach(({ data }) => (data || []).forEach((row: any) => { map[row.id] = row.nombre; }));
      setSpecNames(map);
    };
    loadSpecNames();
  }, []);

  const normalizeText = (s: unknown) =>
    String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  // "2026-08-15" -> "15/08/2026", para poder buscar la fecha tal como se ve en pantalla
  const isoToDisplay = (iso?: string | null) => (iso ? iso.split('T')[0].split('-').reverse().join('/') : '');

  // Búsqueda libre: cada palabra tiene que aparecer en algún campo del trabajo (AND entre palabras)
  const jobMatchesSearch = (job: Job) => {
    const words = normalizeText(searchTerm).split(/\s+/).filter(Boolean);
    if (words.length === 0) return true;
    const j = job as any;
    const haystack = normalizeText([
      j.cliente_nombre, job.descripcion, job.estado, job.id, j.numero_trabajo,
      j.fecha, isoToDisplay(j.fecha), job.fecha_entrega, isoToDisplay(job.fecha_entrega),
      job.total, j.observaciones,
      ...SPEC_FIELDS.map(f => specNames[j[f.key]])
    ].filter(v => v !== null && v !== undefined).join(' '));
    return words.every(w => haystack.includes(w));
  };

  // Rango de fechas sobre la fecha de ingreso del trabajo (comparación de strings ISO YYYY-MM-DD)
  const jobMatchesDates = (job: Job) => {
    const fecha = ((job as any).fecha || '').split('T')[0];
    if (fechaDesde && (!fecha || fecha < fechaDesde)) return false;
    if (fechaHasta && (!fecha || fecha > fechaHasta)) return false;
    return true;
  };

  const getJobSpecs = (job: Job): JobSpec[] =>
    SPEC_FIELDS.map(f => ({ label: f.label, nombre: specNames[(job as any)[f.key]] || null, color: f.color }));

  // Aplica el cambio de estado en la base. Separado de handleMoveJob para poder
  // llamarlo recién después de confirmar el cobro obligatorio (ver JobCompletionPaymentModal).
  const applyStatusUpdate = async (job: Job, newStatus: string) => {
    try {
      const id = job.id;
      const updateData: any = { estado: newStatus };

      // Handle timestamps for forward moves (nombres de estado reales: PRESUPUESTADO,
      // APROBADO, EN PRODUCCIÓN, TERMINADO, ENTREGADO — ver `columns` más abajo)
      const approvalStatuses = ['APROBADO', 'EN PRODUCCIÓN', 'TERMINADO', 'ENTREGADO'];
      if (approvalStatuses.includes(newStatus) && !updateData.fecha_aprobacion) {
        // We set it only if it wasn't set before
        updateData.fecha_aprobacion = todayAR();
      }
      if (newStatus === 'EN PRODUCCIÓN') updateData.fecha_pase_produccion = new Date().toISOString();
      if (newStatus === 'TERMINADO') updateData.fecha_prod_fin = new Date().toISOString();
      if (newStatus === 'ENTREGADO') updateData.fecha_entregado = new Date().toISOString();

      // Clear timestamps for backward moves
      if (newStatus === 'PRESUPUESTADO') updateData.fecha_aprobacion = null;
      if (newStatus === 'EN PRODUCCIÓN') updateData.fecha_prod_fin = null;
      if (newStatus === 'TERMINADO') {
        // If we are coming back from ENTREGADO, we should clear fecha_entregado
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

  const handleMoveJob = async (job: Job, newStatus: string) => {
    // Al pasar a TERMINADO o ENTREGADO con saldo pendiente, es obligatorio
    // registrar el cobro (parcial o total) antes de que el estado avance.
    if (['TERMINADO', 'ENTREGADO'].includes(newStatus) && Number(job.saldo_pendiente || 0) > 0) {
      setCompletionPayment({ job, targetStatus: newStatus });
      return;
    }
    await applyStatusUpdate(job, newStatus);
  };

  const handleCompletionConfirmed = async () => {
    if (!completionPayment) return;
    const { job, targetStatus } = completionPayment;
    setCompletionPayment(null);
    await applyStatusUpdate(job, targetStatus);
  };

  const handleDuplicateJob = async (job: Job) => {
    try {
      const { data, error } = await supabase.rpc('duplicar_trabajo', {
        p_trabajo_id: job.id,
        p_usuario_id: user?.id || null
      });
      if (error) throw error;

      const nuevo = data?.[0];
      const actualizados = Number(nuevo?.items_precio_actualizado || 0);
      toast.success(
        actualizados > 0
          ? `Trabajo duplicado como presupuesto. ${actualizados} ítem(s) con el precio actualizado del catálogo.`
          : 'Trabajo duplicado como presupuesto.'
      );
      await fetchJobs();
      if (nuevo?.nuevo_trabajo_id) {
        setSelectedJobId(nuevo.nuevo_trabajo_id);
        setIsModalOpen(true);
      }
    } catch (error: any) {
      toast.error('Error al duplicar: ' + error.message);
    }
  };

  const handleDeleteJob = async (job: Job) => {
    if (job.estado === 'ENTREGADO') {
      toast.error('No se puede eliminar un trabajo ya ENTREGADO.');
      return;
    }
    const tienePagos = Number(job.saldo_pendiente) < Number(job.total);
    if (tienePagos || job.facturado) {
      toast.error('No se puede eliminar un trabajo con pagos registrados y/o facturado. Revertí el pago o la factura primero si necesitás corregirlo.');
      return;
    }
    if (!confirm('¿Eliminar este trabajo?')) return;

    try {
      const { error } = await supabase.from('t_trabajos').update({ estado: 'ANULADO' }).eq('id', job.id);
      if (error) throw error;
      toast.success('Trabajo eliminado');
      fetchJobs();
    } catch (error: any) {
      toast.error('Error al eliminar: ' + error.message);
    }
  };

  const columns = [
    {
      title: 'PRESUPUESTADO',
      status: 'PRESUPUESTADO',
      color: 'bg-slate-400',
      badgeClasses: 'bg-slate-400/10 text-slate-700',
      next: 'APROBADO',
      prev: null,
      label: 'Aprobar',
      nextIcon: 'thumb_up'
    },
    {
      title: 'APROBADO',
      status: 'APROBADO',
      color: 'bg-indigo-400',
      badgeClasses: 'bg-indigo-400/10 text-indigo-700',
      next: 'EN PRODUCCIÓN',
      prev: 'PRESUPUESTADO',
      label: 'Producir',
      nextIcon: 'play_circle'
    },
    {
      title: 'EN PRODUCCIÓN',
      status: 'EN PRODUCCIÓN',
      color: 'bg-blue-500',
      badgeClasses: 'bg-blue-500/10 text-blue-700',
      next: 'TERMINADO',
      prev: 'APROBADO',
      label: 'Finalizar',
      nextIcon: 'check_circle'
    },
    {
      title: 'TERMINADO',
      status: 'TERMINADO',
      color: 'bg-amber-500',
      badgeClasses: 'bg-amber-500/10 text-amber-700',
      next: 'ENTREGADO',
      prev: 'EN PRODUCCIÓN',
      label: 'Entregar',
      nextIcon: 'local_shipping'
    },
    {
      title: 'ENTREGADO',
      status: 'ENTREGADO',
      color: 'bg-emerald-500',
      badgeClasses: 'bg-emerald-500/10 text-emerald-700',
      next: null,
      prev: 'TERMINADO',
      label: '',
      nextIcon: ''
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

  // Lista filtrada de la vista Tabla + paginado (todo en el frontend: ya se cargan todos los trabajos,
  // y la búsqueda necesita los nombres de specs resueltos en el cliente)
  const sortValue = (j: any) => {
    switch (sortKey) {
      case 'cliente': return (j.cliente_nombre || '').toLowerCase();
      case 'total': return Number(j.total) || 0;
      case 'fecha_entrega': return j.fecha_entrega || (sortDir === 'asc' ? '9999' : '0000');
      case 'estado': return (j.estado || '').toLowerCase();
      case 'fecha':
      default: return j.fecha || '0000';
    }
  };

  const tableJobs = jobs
    .filter(j => jobMatchesSearch(j) && jobMatchesDates(j))
    .filter(j => {
      if (statusFilter !== 'all' && j.estado !== statusFilter) return false;
      if (pendingOnly && (j.saldo_pendiente || 0) <= 0) return false;
      if (deadlineFilter === 'all') return true;
      if (j.estado === 'ENTREGADO') return false;
      const status = getDueDateStatus(j.fecha_entrega);
      if (deadlineFilter === 'overdue') return status === 'OVERDUE';
      if (deadlineFilter === 'due_soon') return status === 'DUE_SOON';
      return true;
    })
    .sort((a, b) => {
      const va = sortValue(a);
      const vb = sortValue(b);
      const cmp = va < vb ? -1 : va > vb ? 1 : 0;
      return sortDir === 'asc' ? cmp : -cmp;
    });
  const totalPages = Math.max(1, Math.ceil(tableJobs.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedJobs = tableJobs.slice((safePage - 1) * pageSize, safePage * pageSize);

  // Al cambiar cualquier filtro o el tamaño de página, volver a la primera página
  useEffect(() => {
    setPage(1);
  }, [searchTerm, fechaDesde, fechaHasta, statusFilter, pendingOnly, deadlineFilter, pageSize]);

  return (
    <div className="p-8 max-w-[1600px] mx-auto space-y-8 animate-in fade-in duration-700 pb-20">
      {/* Top Header Actions */}
      <div className="space-y-5">
        {/* Fila 1: buscador + acción principal */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
          <div className="relative flex-1 group">
            <span className="absolute left-5 top-1/2 -translate-y-1/2 material-symbols-outlined text-outline group-focus-within:text-primary transition-colors">search</span>
            <input
              type="text"
              placeholder="Buscar por cliente, descripción, estado, fecha, total, especificaciones, observaciones..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-surface-container-low border border-outline-variant/5 rounded-2xl py-3.5 pl-14 pr-6 text-sm font-bold focus:ring-4 focus:ring-primary/10 transition-all outline-none shadow-sm"
            />
          </div>
          <button
            onClick={() => setIsModalOpen(true)}
            className="sm:w-auto flex items-center justify-center gap-2 px-8 py-3.5 bg-primary text-white font-bold rounded-2xl shadow-xl shadow-primary/20 hover:brightness-110 active:scale-95 transition-all text-sm"
          >
            <span className="material-symbols-outlined text-[1.2rem]">add</span>
            Nuevo Trabajo
          </button>
        </div>

        {/* Fila 2: vista y filtros */}
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
                  className={`px-5 py-2 rounded-xl text-[10px] font-black tracking-tighter transition-all ${isActive ? `${f.activeBg} ${f.activeText} shadow-sm` : 'text-on-surface-variant hover:text-primary'
                    }`}
                >
                  {f.label}
                </button>
              );
            })}
          </div>

          {/* Status Filter */}
          <div className="bg-surface-container-low/50 p-1.5 rounded-2xl border border-outline-variant/10">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-transparent border-none text-[10px] font-black tracking-widest uppercase px-4 py-2 outline-none cursor-pointer"
            >
              <option value="all">TODOS LOS ESTADOS</option>
              {columns.map(c => (
                <option key={c.status} value={c.status}>{c.title}</option>
              ))}
            </select>
          </div>

          {/* Date range filter (fecha de ingreso) */}
          <div className="bg-surface-container-low/50 p-1.5 rounded-2xl border border-outline-variant/10 flex items-center gap-2 px-4">
            <span className="text-[10px] font-black tracking-widest uppercase text-on-surface-variant">Ingreso</span>
            <input
              type="date"
              value={fechaDesde}
              onChange={(e) => setFechaDesde(e.target.value)}
              title="Desde"
              className="bg-transparent border-none text-xs font-bold outline-none cursor-pointer py-1.5"
            />
            <span className="text-outline">→</span>
            <input
              type="date"
              value={fechaHasta}
              onChange={(e) => setFechaHasta(e.target.value)}
              title="Hasta"
              className="bg-transparent border-none text-xs font-bold outline-none cursor-pointer py-1.5"
            />
            {(fechaDesde || fechaHasta) && (
              <button
                onClick={() => { setFechaDesde(''); setFechaHasta(''); }}
                title="Limpiar fechas"
                className="material-symbols-outlined text-lg text-outline hover:text-error transition-colors"
              >
                close
              </button>
            )}
          </div>

          {/* Pending Balance Toggle */}
          <button
            onClick={() => setPendingOnly(!pendingOnly)}
            className={`px-6 py-2 rounded-xl text-[10px] font-black tracking-widest transition-all flex items-center gap-2 border ${pendingOnly ? 'bg-error text-white border-error shadow-lg shadow-error/20' : 'bg-surface-container-low text-on-surface-variant border-outline-variant/10 hover:border-error/30'}`}
          >
            <span className="material-symbols-outlined text-[1.2rem]">{pendingOnly ? 'money_off' : 'payments'}</span>
            SOLO DEUDA
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

            const colJobs = jobs.filter(j => (j.estado || 'PRESUPUESTADO').toUpperCase() === col.status)
              .filter(j => jobMatchesSearch(j) && jobMatchesDates(j))
              .filter(j => {
                if (statusFilter !== 'all' && j.estado !== statusFilter) return false;
                if (pendingOnly && (j.saldo_pendiente || 0) <= 0) return false;
                if (deadlineFilter === 'all') return true;
                if (j.estado === 'ENTREGADO') return false;
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
                          <div className="flex gap-2">
                            {job.facturado && (
                              <span className="flex items-center gap-1 text-[9px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md w-fit uppercase tracking-tighter border border-emerald-100">
                                <span className="material-symbols-outlined text-[12px]">receipt</span>
                                Facturado
                              </span>
                            )}
                            {(job.saldo_pendiente || 0) > 0 && job.estado !== 'PRESUPUESTADO' && (
                              <span className="flex items-center gap-1 text-[9px] font-black text-error bg-error/5 px-2 py-0.5 rounded-md w-fit uppercase tracking-tighter border border-error/10">
                                <span className="material-symbols-outlined text-[12px]">payments</span>
                                Pendiente
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              printJobVoucher(job.id);
                            }}
                            className="p-1 hover:bg-indigo-50 text-indigo-600 rounded-md transition-all"
                            title="Imprimir comprobante"
                          >
                            <span className="material-symbols-outlined text-[18px]">print</span>
                          </button>
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
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDuplicateJob(job);
                            }}
                            className="p-1 hover:bg-primary/10 text-outline hover:text-primary rounded-md transition-all"
                            title="Duplicar como nuevo presupuesto"
                          >
                            <span className="material-symbols-outlined text-[18px]">content_copy</span>
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteJob(job);
                            }}
                            className="p-1 hover:bg-error/10 text-outline hover:text-error rounded-md transition-all"
                            title="Eliminar trabajo"
                          >
                            <span className="material-symbols-outlined text-[18px]">delete</span>
                          </button>
                          <span className="text-[10px] font-bold text-outline uppercase tracking-wider">
                            #{job.id.slice(0, 5)}
                          </span>
                        </div>
                      </div>

                      <h4 className="font-headline font-extrabold text-on-surface text-lg leading-tight mb-2 group-hover:text-primary transition-colors">
                        {(job as any).cliente_nombre || 'Cliente sin nombre'}
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
                            <span className="text-[10px] font-bold">{job.fecha_entrega ? job.fecha_entrega.split('-').reverse().join('/') : 'S/D'}</span>
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
                          <div className="flex flex-col items-end gap-0.5 mt-0.5">
                            {(Number(job.total_pagado_directo || 0) + Number(job.total_aplicado_cc || 0)) > 0 && (
                              <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">
                                Pagado: ${Number(Number(job.total_pagado_directo || 0) + Number(job.total_aplicado_cc || 0)).toLocaleString('es-AR')}
                              </span>
                            )}
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${Number(job.saldo_pendiente || 0) > 0 ? 'bg-error/5 text-error' : 'bg-primary/5 text-primary'}`}>
                              Saldo: ${Number(job.saldo_pendiente || 0).toLocaleString('es-AR')}
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
                              handleMoveJob(job, col.prev!);
                            }}
                            title="Regresar al estado anterior"
                            className="aspect-square bg-surface-container-low hover:bg-error hover:text-white text-outline-variant rounded-xl transition-all flex items-center justify-center border border-outline-variant/5"
                          >
                            <span className="material-symbols-outlined text-lg">undo</span>
                          </button>
                        )}

                        {col.status === 'TERMINADO' && (
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
                              handleMoveJob(job, col.next!);
                            }}
                            className={`${(col.prev || col.status === 'TERMINADO') ? 'col-span-4' : 'col-span-5'} py-2 bg-surface-container-low hover:bg-primary hover:text-white text-primary text-[10px] font-black uppercase tracking-[0.1em] rounded-xl transition-all flex items-center justify-center gap-2 group/btn border border-outline-variant/5 h-10`}
                          >
                            <span className="material-symbols-outlined text-lg group-hover/btn:translate-x-1 transition-transform">
                              {col.nextIcon || 'trending_flat'}
                            </span>
                            {col.label}
                          </button>
                        ) : (
                          <div className="col-span-5 py-2 px-4 bg-emerald-50 text-emerald-600 text-[10px] font-black uppercase tracking-[0.1em] rounded-xl border border-emerald-100 flex items-center justify-center gap-2 h-10">
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
            <table className="w-full text-left border-collapse min-w-[1050px]">
              <thead>
                <tr className="bg-surface-container-low/50">
                  {([
                    ['cliente', 'Cliente', 'text-left', 'px-8'],
                    [null, 'Descripción', 'text-left', 'px-6'],
                    [null, 'Specs', 'text-left', 'px-6'],
                    ['total', 'Total', 'text-left', 'px-6'],
                    ['fecha', 'Ingreso / Caducidad', 'text-left', 'px-6'],
                    ['fecha_entrega', 'Entrega', 'text-center', 'px-6'],
                    ['estado', 'Estado', 'text-center', 'px-6'],
                    [null, 'Acciones', 'text-center', 'px-8'],
                  ] as const).map(([key, label, align, pad]) => (
                    <th
                      key={label}
                      onClick={key ? () => {
                        if (sortKey === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
                        else { setSortKey(key as typeof sortKey); setSortDir(key === 'cliente' || key === 'estado' ? 'asc' : 'desc'); }
                      } : undefined}
                      className={`${pad} py-5 text-[10px] font-black text-on-surface-variant uppercase tracking-widest ${align} whitespace-nowrap ${key ? 'cursor-pointer select-none hover:text-primary transition-colors' : ''}`}
                      title={key ? 'Ordenar' : undefined}
                    >
                      <span className="inline-flex items-center gap-1">
                        {label}
                        {key && (
                          <span className={`material-symbols-outlined text-[14px] ${sortKey === key ? 'text-primary' : 'text-outline/30'}`}>
                            {sortKey === key ? (sortDir === 'asc' ? 'arrow_upward' : 'arrow_downward') : 'unfold_more'}
                          </span>
                        )}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/5">
                {tableJobs.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-20 text-center text-outline/40 italic text-sm">
                      No hay trabajos que coincidan con los filtros
                    </td>
                  </tr>
                )}
                {pagedJobs
                  .map(job => {
                    const currentStatus = (job.estado || 'EN PRODUCCIÓN').toUpperCase();
                    const col = columns.find(c => c.status === currentStatus) || columns[0];

                    return (
                      <tr key={job.id} className="hover:bg-surface-container-low transition-colors group">
                        <td className="px-8 py-5">
                          <p className="text-sm font-bold text-on-surface">
                            {(job as any).cliente_nombre || 'Cliente sin nombre'}
                          </p>
                          <p className="text-[10px] text-outline font-medium">#{job.id.slice(0, 8).toUpperCase()}</p>
                        </td>
                        <td className="px-6 py-5 text-sm text-on-surface-variant max-w-xs truncate">{job.descripcion}</td>
                        <td className="px-6 py-5">
                          {(() => {
                            const specs = getJobSpecs(job);
                            const cargadas = specs.filter(s => s.nombre);
                            const visibles = cargadas.slice(0, 3);
                            const extra = cargadas.length - visibles.length;
                            return (
                              <div
                                className="flex items-center w-fit cursor-help"
                                onMouseEnter={(e) => {
                                  const r = e.currentTarget.getBoundingClientRect();
                                  setSpecTip({ x: r.left, y: r.bottom + 6, specs });
                                }}
                                onMouseLeave={() => setSpecTip(null)}
                              >
                                {cargadas.length === 0 && <span className="text-outline/40 text-sm">---</span>}
                                {visibles.map((s, i) => (
                                  <span
                                    key={s.label}
                                    className={`w-8 h-8 rounded-full ring-2 ring-white flex items-center justify-center text-[10px] font-black text-white ${s.color} ${i > 0 ? '-ml-2' : ''}`}
                                  >
                                    {s.nombre!.slice(0, 2)}
                                  </span>
                                ))}
                                {extra > 0 && (
                                  <span className="w-8 h-8 rounded-full ring-2 ring-white -ml-2 flex items-center justify-center text-[10px] font-black bg-slate-200 text-slate-600">
                                    +{extra}
                                  </span>
                                )}
                              </div>
                            );
                          })()}
                        </td>
                        <td className="px-6 py-5">
                          <p className="text-sm font-black text-on-surface">${Number(job.total).toLocaleString('es-AR')}</p>
                          {Number(job.saldo_pendiente) > 0 && (
                            <p className="text-[9px] text-error font-bold">Saldo: ${Number(job.saldo_pendiente).toLocaleString('es-AR')}</p>
                          )}
                          {job.facturado && (
                            <span className="text-[8px] bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded font-black uppercase">Facturado</span>
                          )}
                        </td>
                        <td className="px-6 py-5">
                          <p className="text-[10px] text-on-surface-variant font-medium">
                            Ingreso: {(job as any).fecha ? (job as any).fecha.split('-').reverse().join('/') : '---'}
                          </p>
                          {job.estado === 'PRESUPUESTADO' && (
                            <p className={`text-[10px] font-bold ${job.fecha_vencimiento_presupuesto ? 'text-error' : 'text-outline/50'}`}>
                              Caduca: {job.fecha_vencimiento_presupuesto ? job.fecha_vencimiento_presupuesto.split('-').reverse().join('/') : '---'}
                            </p>
                          )}
                        </td>
                        <td className="px-6 py-5 text-center">
                          <p className="text-sm font-medium">{job.fecha_entrega ? job.fecha_entrega.split('-').reverse().join('/') : '---'}</p>
                          {job.estado !== 'ENTREGADO' && getDueDateStatus(job.fecha_entrega) && (
                            <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-full inline-block mt-1
                             ${getDueDateStatus(job.fecha_entrega) === 'OVERDUE' ? 'bg-error text-white' : 'bg-amber-500 text-white'}`}>
                              {getDueDateStatus(job.fecha_entrega) === 'OVERDUE' ? 'Vencido' : 'Próximo'}
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-5 text-center">
                          <span className={`px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-wider ${col.badgeClasses}`}>
                            {currentStatus}
                          </span>
                        </td>
                        <td className="px-8 py-5">
                          <div className="flex items-center justify-center gap-2">
                            {/* Prev Action */}
                            {col.prev && (
                              <button
                                onClick={() => handleMoveJob(job, col.prev!)}
                                title="Regresar estado"
                                className="p-2 hover:bg-error/10 text-error/60 hover:text-error rounded-lg transition-all"
                              >
                                <span className="material-symbols-outlined text-lg">undo</span>
                              </button>
                            )}

                            {/* Print Action */}
                            <button
                              onClick={() => printJobVoucher(job.id)}
                              title="Imprimir comprobante"
                              className="p-2 hover:bg-indigo-50 text-indigo-600/60 hover:text-indigo-600 rounded-lg transition-all"
                            >
                              <span className="material-symbols-outlined text-lg">print</span>
                            </button>

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

                            {/* Duplicate Action */}
                            <button
                              onClick={() => handleDuplicateJob(job)}
                              title="Duplicar como nuevo presupuesto"
                              className="p-2 hover:bg-primary/10 text-primary/60 hover:text-primary rounded-lg transition-all"
                            >
                              <span className="material-symbols-outlined text-lg">content_copy</span>
                            </button>

                            {currentStatus === 'TERMINADO' && (
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
                                onClick={() => handleMoveJob(job, col.next!)}
                                title={col.label}
                                className="p-2 bg-primary text-white rounded-lg shadow-sm hover:shadow-md hover:brightness-110 transition-all flex items-center justify-center"
                              >
                                <span className="material-symbols-outlined text-lg">
                                  {col.nextIcon || 'trending_flat'}
                                </span>
                              </button>
                            )}

                            {/* Delete Action */}
                            <button
                              onClick={() => handleDeleteJob(job)}
                              title="Eliminar trabajo"
                              className="p-2 hover:bg-error/10 text-error/60 hover:text-error rounded-lg transition-all"
                            >
                              <span className="material-symbols-outlined text-lg">delete</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>

          {/* Paginado */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-8 py-4 border-t border-outline-variant/10 bg-surface-container-low/30">
            <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
              {tableJobs.length === 0
                ? 'Sin resultados'
                : `Mostrando ${(safePage - 1) * pageSize + 1}–${Math.min(safePage * pageSize, tableJobs.length)} de ${tableJobs.length}`}
            </p>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
                Por página
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value))}
                  className="bg-white border border-outline-variant/10 rounded-lg px-2 py-1 text-xs font-bold outline-none cursor-pointer"
                >
                  {[10, 25, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage(1)}
                  disabled={safePage === 1}
                  title="Primera página"
                  className="material-symbols-outlined text-lg p-1.5 rounded-lg hover:bg-white disabled:opacity-30 disabled:hover:bg-transparent transition-all"
                >
                  first_page
                </button>
                <button
                  onClick={() => setPage(safePage - 1)}
                  disabled={safePage === 1}
                  title="Anterior"
                  className="material-symbols-outlined text-lg p-1.5 rounded-lg hover:bg-white disabled:opacity-30 disabled:hover:bg-transparent transition-all"
                >
                  chevron_left
                </button>
                <span className="px-3 text-xs font-black text-on-surface whitespace-nowrap">
                  Página {safePage} de {totalPages}
                </span>
                <button
                  onClick={() => setPage(safePage + 1)}
                  disabled={safePage === totalPages}
                  title="Siguiente"
                  className="material-symbols-outlined text-lg p-1.5 rounded-lg hover:bg-white disabled:opacity-30 disabled:hover:bg-transparent transition-all"
                >
                  chevron_right
                </button>
                <button
                  onClick={() => setPage(totalPages)}
                  disabled={safePage === totalPages}
                  title="Última página"
                  className="material-symbols-outlined text-lg p-1.5 rounded-lg hover:bg-white disabled:opacity-30 disabled:hover:bg-transparent transition-all"
                >
                  last_page
                </button>
              </div>
            </div>
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

      {/* Tooltip de especificaciones técnicas (hover en la columna Specs) */}
      {specTip && (
        <div
          className="fixed z-[90] bg-slate-900 text-white rounded-2xl shadow-2xl px-4 py-3 pointer-events-none space-y-1"
          style={{ left: Math.min(specTip.x, window.innerWidth - 260), top: specTip.y }}
        >
          {specTip.specs.map(s => (
            <div key={s.label} className="flex justify-between items-center gap-6 text-[11px]">
              <span className="font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${s.color}`}></span>
                {s.label}
              </span>
              <span className="font-bold">{s.nombre || '—'}</span>
            </div>
          ))}
        </div>
      )}

      {/* Cobro obligatorio al pasar a TERMINADO/ENTREGADO con saldo pendiente */}
      {completionPayment && (
        <JobCompletionPaymentModal
          job={completionPayment.job as any}
          targetStatus={completionPayment.targetStatus}
          onClose={() => setCompletionPayment(null)}
          onConfirmed={handleCompletionConfirmed}
        />
      )}
    </div>
  );
};

export default KanbanPage;
