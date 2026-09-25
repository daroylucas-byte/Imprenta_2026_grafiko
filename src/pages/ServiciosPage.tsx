import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { toast } from 'react-hot-toast';
import ServicioModal from '../components/ServicioModal';

const normalizeText = (s: unknown) =>
  String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

interface ServicioItem {
  id: string;
  nombre: string;
  tipo: 'propio' | 'tercerizado';
  unidad_id?: string | null;
  costo_unitario: number;
  observaciones?: string | null;
  activo: boolean;
  created_at: string;
  t_conf_unidades_medida?: any;
}

const ServiciosPage: React.FC = () => {
  const [servicios, setServicios] = useState<ServicioItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Configuración de margen por defecto
  const [margenDefecto, setMargenDefecto] = useState<number | string>(40);
  const [savingMargen, setSavingMargen] = useState(false);
  const [loadingConfig, setLoadingConfig] = useState(true);

  // Modales y filtros
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedServicioId, setSelectedServicioId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'activos' | 'inactivos' | 'todos'>('activos');

  const fetchConfig = useCallback(async () => {
    setLoadingConfig(true);
    try {
      const { data, error } = await supabase
        .from('t_config_costeo')
        .select('*')
        .eq('id', 1)
        .single();

      if (error) throw error;
      if (data) {
        setMargenDefecto(Number(data.margen_defecto_pct ?? 40));
      }
    } catch (err: any) {
      console.error('Error fetching costeo config:', err);
      // No bloqueante si la tabla estuviera vacía
    } finally {
      setLoadingConfig(false);
    }
  }, []);

  const fetchServicios = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('t_servicios')
        .select('*, t_conf_unidades_medida(id, nombre)')
        .order('nombre', { ascending: true });

      if (error) throw error;
      setServicios((data || []) as ServicioItem[]);
    } catch (err: any) {
      console.error('Error fetching servicios:', err);
      toast.error('Error al cargar servicios: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfig();
    fetchServicios();
  }, [fetchConfig, fetchServicios]);

  const handleSaveMargen = async (e: React.FormEvent) => {
    e.preventDefault();
    const numMargen = Math.max(0, Number(margenDefecto) || 0);

    setSavingMargen(true);
    try {
      const { error } = await supabase
        .from('t_config_costeo')
        .update({
          margen_defecto_pct: numMargen,
          updated_at: new Date().toISOString(),
        })
        .eq('id', 1);

      if (error) throw error;
      toast.success(`Margen por defecto guardado en ${numMargen}%`);
    } catch (err: any) {
      console.error('Error saving config margen:', err);
      toast.error('Error al guardar el margen: ' + err.message);
    } finally {
      setSavingMargen(false);
    }
  };

  const handleToggleActivo = async (s: ServicioItem) => {
    const nuevoEstado = !s.activo;
    if (
      nuevoEstado === false &&
      !window.confirm(
        `¿Inactivar el servicio ${s.nombre}? No aparecerá en presupuestos futuros, pero el historial se conserva.`
      )
    ) {
      return;
    }

    try {
      const { error } = await supabase
        .from('t_servicios')
        .update({ activo: nuevoEstado })
        .eq('id', s.id);

      if (error) throw error;
      toast.success(nuevoEstado ? 'Servicio reactivado' : 'Servicio inactivado');
      fetchServicios();
    } catch (err: any) {
      toast.error('Error al actualizar servicio: ' + err.message);
    }
  };

  const servicioMatchesSearch = (s: ServicioItem) => {
    const words = normalizeText(searchTerm).split(/\s+/).filter(Boolean);
    if (words.length === 0) return true;
    const unidadNombre = Array.isArray(s.t_conf_unidades_medida)
      ? s.t_conf_unidades_medida[0]?.nombre || ''
      : s.t_conf_unidades_medida?.nombre || '';
    const haystack = normalizeText(
      [s.nombre, s.tipo, s.observaciones, unidadNombre]
        .filter((v) => v !== null && v !== undefined && v !== '')
        .join(' ')
    );
    return words.every((w) => haystack.includes(w));
  };

  const filteredServicios = servicios.filter((s) => {
    if (activeTab === 'activos' && s.activo === false) return false;
    if (activeTab === 'inactivos' && s.activo !== false) return false;
    return servicioMatchesSearch(s);
  });

  const cantPropios = servicios.filter((s) => s.activo !== false && s.tipo === 'propio').length;
  const cantTercerizados = servicios.filter((s) => s.activo !== false && s.tipo === 'tercerizado').length;

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in duration-700">
      {/* Top Banner: Margen por Defecto */}
      <div className="bg-surface-container-lowest p-8 rounded-[2.5rem] shadow-sm border border-outline-variant/10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div className="space-y-1 max-w-xl">
          <div className="flex items-center gap-2 text-primary font-bold text-xs uppercase tracking-widest">
            <span className="material-symbols-outlined text-base">percent</span>
            <span>Parámetro General de Presupuestación</span>
          </div>
          <h3 className="text-2xl font-headline font-extrabold text-on-surface tracking-tight">
            Margen de Ganancia por Defecto
          </h3>
          <p className="text-xs text-on-surface-variant font-medium">
            Recargo sobre el costo que se propone al calcular un precio en la calculadora de presupuestos. Se puede ajustar en cada cálculo individual.
          </p>
        </div>

        <form onSubmit={handleSaveMargen} className="flex items-center gap-3 w-full md:w-auto">
          <div className="relative flex items-center">
            <input
              type="number"
              step="any"
              min="0"
              disabled={loadingConfig || savingMargen}
              value={margenDefecto}
              onChange={(e) => setMargenDefecto(e.target.value)}
              className="w-32 bg-surface-container-low border-none rounded-2xl py-3 pl-4 pr-10 text-xl font-black text-primary focus:ring-2 focus:ring-primary/20 shadow-inner"
            />
            <span className="absolute right-4 text-sm font-black text-outline pointer-events-none">%</span>
          </div>
          <button
            type="submit"
            disabled={loadingConfig || savingMargen}
            className="px-6 py-3.5 bg-primary text-white font-bold text-xs uppercase tracking-widest rounded-2xl shadow-lg shadow-primary/20 hover:brightness-110 active:scale-95 transition-all flex items-center gap-2 disabled:opacity-50"
          >
            {savingMargen ? (
              <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
            ) : (
              <>
                <span className="material-symbols-outlined text-base">save</span>
                Guardar
              </>
            )}
          </button>
        </form>
      </div>

      {/* Main Catalog Section */}
      <div className="bg-surface-container-lowest rounded-[2.5rem] shadow-sm border border-outline-variant/10 overflow-hidden">
        {/* Header con Buscador y Botón */}
        <div className="p-8 border-b border-outline-variant/5 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-4">
            <div>
              <h2 className="text-2xl font-headline font-extrabold text-on-surface tracking-tight">
                Catálogo de Servicios
              </h2>
              <p className="text-[10px] text-outline font-bold uppercase tracking-wider mt-0.5">
                {cantPropios} propios · {cantTercerizados} tercerizados activos
              </p>
            </div>
            <button
              onClick={() => {
                setSelectedServicioId(null);
                setIsModalOpen(true);
              }}
              className="hidden sm:flex items-center gap-2 px-4 py-2 bg-primary text-white text-xs font-bold rounded-xl shadow-md shadow-primary/20 hover:brightness-110 active:scale-95 transition-all"
            >
              <span className="material-symbols-outlined text-sm">add</span>
              Nuevo Servicio
            </button>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-4 w-full md:w-auto">
            {/* Buscador */}
            <div className="relative w-full sm:w-80 md:w-96">
              <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant">
                search
              </span>
              <input
                className="w-full bg-surface-container-low border-none rounded-2xl pl-12 pr-6 py-3 text-sm font-bold focus:ring-2 focus:ring-primary/20 transition-all shadow-inner"
                placeholder="Buscar por nombre, tipo u observaciones..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Filtros: Pestañas */}
        <div className="flex justify-between items-center px-8 bg-white border-b border-outline-variant/5">
          <div className="flex">
            <button
              onClick={() => setActiveTab('activos')}
              className={`px-6 py-4 text-[10px] font-black uppercase tracking-[0.2em] transition-all border-b-2 ${
                activeTab === 'activos'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-outline'
              }`}
            >
              Activos ({servicios.filter((s) => s.activo !== false).length})
            </button>
            <button
              onClick={() => setActiveTab('inactivos')}
              className={`px-6 py-4 text-[10px] font-black uppercase tracking-[0.2em] transition-all border-b-2 ${
                activeTab === 'inactivos'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-outline'
              }`}
            >
              Inactivos ({servicios.filter((s) => s.activo === false).length})
            </button>
            <button
              onClick={() => setActiveTab('todos')}
              className={`px-6 py-4 text-[10px] font-black uppercase tracking-[0.2em] transition-all border-b-2 ${
                activeTab === 'todos'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-outline'
              }`}
            >
              Todos ({servicios.length})
            </button>
          </div>
        </div>

        {/* Tabla */}
        <div className="overflow-x-auto no-scrollbar">
          {loading ? (
            <div className="h-64 flex flex-col items-center justify-center space-y-4 text-primary/30">
              <div className="w-10 h-10 border-4 border-primary/10 border-t-primary rounded-full animate-spin"></div>
              <p className="text-[10px] font-black uppercase tracking-widest">Sincronizando Servicios...</p>
            </div>
          ) : (
            <table className="w-full text-left border-collapse min-w-[800px]">
              <thead>
                <tr className="bg-surface-container-low/30">
                  <th className="px-8 py-5 text-[10px] font-black text-on-surface-variant uppercase tracking-widest">
                    Servicio
                  </th>
                  <th className="px-6 py-5 text-[10px] font-black text-on-surface-variant uppercase tracking-widest">
                    Tipo
                  </th>
                  <th className="px-6 py-5 text-[10px] font-black text-on-surface-variant uppercase tracking-widest">
                    Unidad
                  </th>
                  <th className="px-6 py-5 text-[10px] font-black text-on-surface-variant uppercase tracking-widest">
                    Costo Unitario
                  </th>
                  <th className="px-6 py-5 text-[10px] font-black text-on-surface-variant uppercase tracking-widest">
                    Estado
                  </th>
                  <th className="px-8 py-5 text-[10px] font-black text-on-surface-variant uppercase tracking-widest text-center">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/5">
                {filteredServicios.map((servicio, i) => {
                  const unidadNombre = Array.isArray(servicio.t_conf_unidades_medida)
                    ? servicio.t_conf_unidades_medida[0]?.nombre || null
                    : servicio.t_conf_unidades_medida?.nombre || null;
                  const costoNum = Number(servicio.costo_unitario || 0);
                  const isPropio = servicio.tipo === 'propio';

                  return (
                    <tr
                      key={servicio.id}
                      className="hover:bg-surface-container-high transition-colors group animate-in fade-in slide-in-from-right-4 duration-300"
                      style={{ animationDelay: `${Math.min(i * 20, 300)}ms` }}
                    >
                      {/* Nombre y Observaciones */}
                      <td className="px-8 py-5">
                        <p className="text-sm font-headline font-extrabold text-on-surface group-hover:text-primary transition-colors">
                          {servicio.nombre}
                        </p>
                        {servicio.observaciones && (
                          <p className="text-[10px] text-outline font-medium line-clamp-1 mt-0.5">
                            {servicio.observaciones}
                          </p>
                        )}
                      </td>

                      {/* Tipo */}
                      <td className="px-6 py-5">
                        <span
                          className={`px-2.5 py-1 text-[9px] font-black uppercase rounded-lg border tracking-widest inline-block ${
                            isPropio
                              ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                              : 'bg-amber-50 text-amber-700 border-amber-200'
                          }`}
                        >
                          {isPropio ? 'Propio (taller)' : 'Tercerizado'}
                        </span>
                      </td>

                      {/* Unidad */}
                      <td className="px-6 py-5 text-xs font-bold text-secondary">
                        {unidadNombre || <span className="text-outline/40 italic">Sin unidad</span>}
                      </td>

                      {/* Costo Unitario */}
                      <td className="px-6 py-5">
                        <p className="text-sm font-black text-on-surface">
                          ${costoNum.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                          {unidadNombre && (
                            <span className="text-[10px] font-bold text-outline ml-1">/ {unidadNombre}</span>
                          )}
                        </p>
                      </td>

                      {/* Estado */}
                      <td className="px-6 py-5">
                        <span
                          className={`px-2.5 py-1 text-[9px] font-black uppercase rounded-lg border tracking-widest inline-block ${
                            servicio.activo !== false
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-slate-100 text-slate-600 border-slate-200'
                          }`}
                        >
                          {servicio.activo !== false ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>

                      {/* Acciones */}
                      <td className="px-8 py-5 text-center">
                        <div className="flex justify-center items-center gap-2">
                          <button
                            onClick={() => {
                              setSelectedServicioId(servicio.id);
                              setIsModalOpen(true);
                            }}
                            title="Editar Servicio"
                            className="bg-slate-50 text-slate-600 hover:bg-primary hover:text-white transition-all p-2 rounded-xl border border-slate-100 shadow-sm"
                          >
                            <span className="material-symbols-outlined text-lg">edit</span>
                          </button>

                          <button
                            onClick={() => handleToggleActivo(servicio)}
                            title={servicio.activo !== false ? 'Inactivar Servicio' : 'Reactivar Servicio'}
                            className={
                              servicio.activo !== false
                                ? 'bg-error/5 text-error hover:bg-error hover:text-white transition-all p-2 rounded-xl border border-error/10 shadow-sm'
                                : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-600 hover:text-white transition-all p-2 rounded-xl border border-emerald-100 shadow-sm'
                            }
                          >
                            <span className="material-symbols-outlined text-lg">
                              {servicio.activo !== false ? 'block' : 'check_circle'}
                            </span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {!loading && filteredServicios.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-20 text-center text-outline/40 italic text-sm">
                      {searchTerm
                        ? `No se encontraron servicios para la búsqueda "${searchTerm}"`
                        : activeTab === 'activos'
                        ? 'No hay servicios activos'
                        : activeTab === 'inactivos'
                        ? 'No hay servicios inactivos'
                        : 'No hay servicios registrados'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer info discreto */}
        <div className="p-6 bg-surface-container-low/30 border-t border-outline-variant/5 flex items-center gap-2 text-outline text-xs">
          <span className="material-symbols-outlined text-base">info</span>
          <span>
            Los servicios propios son horas o tareas del taller (diseño, mano de obra, máquina). Los tercerizados son trabajos que se hacen afuera (troquelado, encuadernado).
          </span>
        </div>
      </div>

      {/* Modal de Alta / Edición de Servicio */}
      {isModalOpen && (
        <ServicioModal
          servicioId={selectedServicioId || undefined}
          onClose={() => {
            setIsModalOpen(false);
            setSelectedServicioId(null);
          }}
          onSuccess={fetchServicios}
        />
      )}
    </div>
  );
};

export default ServiciosPage;
