import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { toast } from 'react-hot-toast';

interface ConfigItem {
  id: string;
  nombre: string;
  created_at: string;
}

interface ConfigTable {
  id: string;
  tableName: string;
  displayName: string;
  icon: string;
  category: 'Producción' | 'Logística' | 'Finanzas';
  description: string;
}

const CONFIG_TABLES: ConfigTable[] = [
  { id: 'soportes', tableName: 't_conf_soportes', displayName: 'Soportes', icon: 'layers', category: 'Producción', description: 'Materiales base para impresión (Papel, Vinilo, Lona, etc.)' },
  { id: 'sistemas', tableName: 't_conf_sistemas_impresion', displayName: 'Sistemas de Impresión', icon: 'print', category: 'Producción', description: 'Métodos técnicos (Offset, Digital, Láser, 3D)' },
  { id: 'tamanios', tableName: 't_conf_tamanios_papel', displayName: 'Tamaños de Papel', icon: 'straighten', category: 'Producción', description: 'Dimensiones estandarizadas (A4, A3, 90x60, etc.)' },
  { id: 'peliculados', tableName: 't_conf_peliculados', displayName: 'Peliculados', icon: 'auto_awesome', category: 'Producción', description: 'Laminados y recubrimientos protectores' },
  { id: 'acabados', tableName: 't_conf_acabados', displayName: 'Acabados', icon: 'texture', category: 'Producción', description: 'Tratamientos de superficie (Mate, Brillo, Soft Touch)' },
  { id: 'terminaciones', tableName: 't_conf_terminaciones', displayName: 'Terminaciones', icon: 'content_cut', category: 'Producción', description: 'Cortes y formas (Troquelado, Refilado, Plegado)' },
  { id: 'copias', tableName: 't_conf_cant_copias', displayName: 'Escalas de Copias', icon: 'filter_none', category: 'Producción', description: 'Rangos predefinidos de cantidad' },
  { id: 'entrega', tableName: 't_conf_tipos_entrega', displayName: 'Estrategias de Entrega', icon: 'local_shipping', category: 'Logística', description: 'Métodos de envío y retiro' },
  { id: 'gasto', tableName: 't_conf_tipos_gasto', displayName: 'Categorías de Gasto', icon: 'account_balance_wallet', category: 'Finanzas', description: 'Clasificación para facturas de compra' },
];

const ConfigDropdownPage: React.FC = () => {
  const [activeTable, setActiveTable] = useState<ConfigTable>(CONFIG_TABLES[0]);
  const [items, setItems] = useState<ConfigItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ConfigItem | null>(null);
  const [newItemName, setNewItemName] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from(activeTable.tableName)
        .select('*')
        .order('nombre', { ascending: true });

      if (error) throw error;
      setItems(data || []);
    } catch (error: any) {
      toast.error(`Error al cargar ${activeTable.displayName}: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }, [activeTable]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const handleOpenModal = (item: ConfigItem | null = null) => {
    setEditingItem(item);
    setNewItemName(item ? item.nombre : '');
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemName.trim()) return;

    setIsSaving(true);
    try {
      if (editingItem) {
        // Update
        const { error } = await supabase
          .from(activeTable.tableName)
          .update({ nombre: newItemName.trim() })
          .eq('id', editingItem.id);
        
        if (error) throw error;
        toast.success(`${activeTable.displayName} actualizado`);
      } else {
        // Create
        const { error } = await supabase
          .from(activeTable.tableName)
          .insert({ nombre: newItemName.trim() });
        
        if (error) throw error;
        toast.success(`Nuevo ${activeTable.displayName.toLowerCase()} añadido`);
      }
      
      setIsModalOpen(false);
      fetchItems();
    } catch (error: any) {
      toast.error(`Error al guardar: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string, nombre: string) => {
    if (!confirm(`¿Estás seguro de eliminar "${nombre}" de la tabla ${activeTable.displayName}?`)) return;

    try {
      const { error } = await supabase
        .from(activeTable.tableName)
        .delete()
        .eq('id', id);
      
      if (error) throw error;
      toast.success('Eliminado correctamente');
      fetchItems();
    } catch (error: any) {
      toast.error(`Error al eliminar: ${error.message}`);
    }
  };

  const filteredItems = items.filter(item => 
    item.nombre.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="flex bg-surface-container-low/30 rounded-3xl overflow-hidden shadow-2xl border border-white/40 h-[calc(100vh-160px)] animate-in zoom-in-95 duration-500">
      {/* Left Sidebar: Table Selector */}
      <aside className="w-80 bg-white border-r border-outline-variant/10 flex flex-col pt-8 pb-4 overflow-hidden">
        <div className="px-8 mb-8">
          <h2 className="text-2xl font-headline font-extrabold text-on-surface tracking-tight">Configuración</h2>
          <p className="text-[10px] text-on-surface-variant font-black uppercase tracking-widest mt-1">Tablas Paramétricas</p>
        </div>

        <nav className="flex-1 overflow-y-auto no-scrollbar px-4 space-y-8">
          {['Producción', 'Logística', 'Finanzas'].map((cat) => (
            <div key={cat} className="space-y-2">
              <h3 className="px-4 text-[10px] font-black text-outline uppercase tracking-[0.2em]">{cat}</h3>
              <div className="space-y-1">
                {CONFIG_TABLES.filter(t => t.category === cat).map((table) => (
                  <button
                    key={table.id}
                    onClick={() => setActiveTable(table)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all group ${
                      activeTable.id === table.id 
                        ? 'bg-primary text-white shadow-lg shadow-primary/20 scale-[1.02]' 
                        : 'text-on-surface-variant hover:bg-surface-container-high'
                    }`}
                  >
                    <span className="material-symbols-outlined text-xl group-hover:scale-110 transition-transform">
                      {table.icon}
                    </span>
                    <span className="text-sm font-bold tracking-tight">{table.displayName}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </nav>
      </aside>

      {/* Main Panel: CRUD View */}
      <main className="flex-1 flex flex-col bg-surface-container-lowest overflow-hidden">
        {/* Table Header Section */}
        <div className="p-10 border-b border-outline-variant/10 bg-white/50 backdrop-blur-md">
          <div className="flex justify-between items-start mb-6">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-primary font-bold text-xs uppercase tracking-widest">
                <span className="material-symbols-outlined text-sm">{activeTable.icon}</span>
                <span>Configuración de {activeTable.displayName}</span>
              </div>
              <h2 className="text-4xl font-headline font-extrabold text-on-surface tracking-tight">{activeTable.displayName}</h2>
              <p className="text-sm text-on-surface-variant">{activeTable.description}</p>
            </div>
            <button 
              onClick={() => handleOpenModal()}
              className="flex items-center gap-2 px-8 py-3 bg-gradient-to-r from-primary to-primary-container text-white font-bold rounded-2xl shadow-xl shadow-primary/20 hover:scale-105 active:scale-95 transition-all text-sm"
            >
              <span className="material-symbols-outlined">add_circle</span>
              Añadir {activeTable.displayName.split(' ').pop()?.replace('s', '')}
            </button>
          </div>

          <div className="relative max-w-md">
            <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-outline text-lg">search</span>
            <input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-4 py-3 bg-surface-container-low border-none rounded-2xl text-sm focus:ring-2 focus:ring-primary/20 transition-all placeholder:text-outline/50"
              placeholder={`Filtrar en ${activeTable.displayName.toLowerCase()}...`}
              type="text"
            />
          </div>
        </div>

        {/* Dynamic Items List */}
        <div className="flex-1 overflow-y-auto p-10 no-scrollbar">
          {loading ? (
             <div className="h-64 flex flex-col items-center justify-center space-y-4 text-primary/40">
                <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
                <p className="text-xs font-bold uppercase tracking-widest">Cargando datos...</p>
             </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {filteredItems.length > 0 ? (
                filteredItems.map((item, i) => (
                  <div 
                    key={item.id} 
                    className="bg-white border border-outline-variant/10 p-5 rounded-2xl flex items-center justify-between hover:shadow-lg hover:border-primary/20 transition-all group animate-in fade-in slide-in-from-right-4 duration-300"
                    style={{ animationDelay: `${i * 50}ms` }}
                  >
                    <div className="flex items-center gap-6">
                      <div className="w-10 h-10 bg-surface-container-low rounded-xl flex items-center justify-center font-bold text-primary text-[10px] overflow-hidden truncate px-1">
                        {item.id.slice(0, 4)}
                      </div>
                      <div>
                        <h4 className="font-bold text-on-surface text-lg">{item.nombre}</h4>
                        <p className="text-[10px] text-outline font-black uppercase tracking-tighter">
                          Creado el {new Date(item.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={() => handleOpenModal(item)}
                        className="p-2 hover:bg-primary/10 text-secondary hover:text-primary rounded-xl transition-all"
                      >
                        <span className="material-symbols-outlined">edit</span>
                      </button>
                      <button 
                        onClick={() => handleDelete(item.id, item.nombre)}
                        className="p-2 hover:bg-error/10 text-secondary hover:text-error rounded-xl transition-all"
                      >
                        <span className="material-symbols-outlined">delete</span>
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                /* Empty State */
                <div className="h-64 flex flex-col items-center justify-center text-on-surface-variant/40 space-y-4">
                  <span className="material-symbols-outlined text-6xl">database_off</span>
                  <p className="font-bold">{searchTerm ? `No se encontraron resultados para "${searchTerm}"` : `No hay datos en ${activeTable.displayName}`}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Hint */}
        <div className="px-10 py-4 bg-surface-container-low/50 text-[10px] font-bold text-outline uppercase tracking-[0.2em] flex items-center gap-2">
          <span className="material-symbols-outlined text-sm">sync</span>
          Sincronizado con Supabase Local
        </div>
      </main>

      {/* Modern Modal / Editor */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl border border-white/20 p-8 animate-in zoom-in-95 slide-in-from-bottom-8 duration-500">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-2xl font-headline font-extrabold text-on-surface">
                {editingItem ? 'Editar' : 'Nuevo'} {activeTable.displayName.replace('s', '')}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="material-symbols-outlined text-on-surface-variant hover:text-error transition-colors">close</button>
            </div>
            
            <form onSubmit={handleSave} className="space-y-6">
              <div className="space-y-2">
                <label className="block text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">Nombre / Identificador</label>
                <input
                  autoFocus
                  required
                  value={newItemName}
                  onChange={(e) => setNewItemName(e.target.value)}
                  className="w-full px-6 py-4 bg-surface-container-low border-none rounded-2xl text-lg font-bold focus:ring-2 focus:ring-primary/20 placeholder:text-outline/30"
                  placeholder="Ej: Papel Obra 90g..."
                  type="text"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 py-4 bg-surface-container-high text-on-surface-variant font-bold rounded-2xl hover:bg-slate-200 transition-all text-sm"
                >
                  Cancelar
                </button>
                <button
                  disabled={isSaving}
                  type="submit"
                  className="flex-3 py-4 bg-primary text-white font-bold rounded-2xl shadow-lg shadow-primary/20 hover:brightness-110 active:scale-[0.98] transition-all text-sm disabled:opacity-50 flex items-center justify-center"
                >
                  {isSaving ? (
                    <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                  ) : (
                    <span>Guardar Cambios</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ConfigDropdownPage;
