import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { toast } from 'react-hot-toast';

interface Product {
  id: string;
  nombre: string;
  descripcion: string;
  precio_costo: number;
  precio_minorista: number;
  precio_mayorista: number;
  categoria: string;
  activo: boolean;
  requiere_numeracion: boolean;
  requiere_fecha_muestra: boolean;
  created_at: string;
}

const ProductsPage: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Partial<Product> | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('t_productos')
        .select('*')
        .order('nombre', { ascending: true });

      if (error) throw error;
      setProducts(data || []);
    } catch (error: any) {
      toast.error('Error al cargar productos: ' + error.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const handleCreateNew = () => {
    setSelectedProduct({
      nombre: '',
      categoria: 'Insumos',
      precio_costo: 0,
      precio_minorista: 0,
      precio_mayorista: 0,
      descripcion: '',
      activo: true,
      requiere_numeracion: false,
      requiere_fecha_muestra: false
    });
    setIsPanelOpen(true);
  };

  const handleEdit = (product: Product) => {
    setSelectedProduct(product);
    setIsPanelOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Estás seguro de eliminar este producto?')) return;
    
    try {
      const { error } = await supabase.from('t_productos').delete().eq('id', id);
      if (error) throw error;
      toast.success('Producto eliminado');
      fetchProducts();
    } catch (error: any) {
      toast.error('Error al eliminar: ' + error.message);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct) return;
    setSaving(true);

    try {
      if (selectedProduct.id) {
        // Update
        const { error } = await supabase
          .from('t_productos')
          .update({
            nombre: selectedProduct.nombre,
            categoria: selectedProduct.categoria,
            precio_costo: selectedProduct.precio_costo,
            precio_minorista: selectedProduct.precio_minorista,
            precio_mayorista: selectedProduct.precio_mayorista,
            descripcion: selectedProduct.descripcion,
            requiere_numeracion: selectedProduct.requiere_numeracion,
            requiere_fecha_muestra: selectedProduct.requiere_fecha_muestra,
          })
          .eq('id', selectedProduct.id);
        if (error) throw error;
        toast.success('Producto actualizado');
      } else {
        // Create
        const { error } = await supabase
          .from('t_productos')
          .insert([selectedProduct]);
        if (error) throw error;
        toast.success('Producto creado');
      }
      setIsPanelOpen(false);
      fetchProducts();
    } catch (error: any) {
      toast.error('Error al guardar: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const filteredProducts = products.filter(p => 
    p.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.id.slice(0,8).toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="max-w-7xl mx-auto flex gap-8 animate-in fade-in duration-700">
      {/* Content Area */}
      <div className={`flex-1 transition-all duration-300 ${isPanelOpen ? 'max-w-[calc(100%-400px)]' : 'w-full'}`}>
        {/* Header Section */}
        <header className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <nav className="flex items-center gap-2 text-xs font-medium text-on-surface-variant mb-2">
              <span>GestiPrint</span>
              <span className="material-symbols-outlined text-[14px]">chevron_right</span>
              <span className="text-primary">Productos</span>
            </nav>
            <h1 className="text-3xl font-headline font-extrabold text-on-background tracking-tight">Inventario de Productos</h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="relative group">
              <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant group-focus-within:text-primary transition-colors">search</span>
              <input 
                className="w-72 bg-white border border-outline-variant/20 focus:ring-2 focus:ring-primary/20 rounded-xl pl-12 pr-4 py-2.5 text-sm transition-all" 
                placeholder="Filtrar por nombre o ID..." 
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <button 
              onClick={handleCreateNew}
              className="bg-primary text-white px-6 py-2.5 rounded-xl font-headline font-bold text-sm shadow-xl shadow-primary/10 hover:brightness-110 active:scale-95 transition-all flex items-center gap-2"
            >
              <span className="material-symbols-outlined">add_circle</span>
              Nuevo Producto
            </button>
          </div>
        </header>

        {loading ? (
          <div className="h-96 bg-white rounded-3xl border border-outline-variant/10 flex flex-col items-center justify-center space-y-4 shadow-sm">
             <div className="w-10 h-10 border-4 border-primary/10 border-t-primary rounded-full animate-spin"></div>
             <p className="text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant/50">Consultando Stock...</p>
          </div>
        ) : (
          <section className="bg-white rounded-[2.5rem] overflow-hidden shadow-sm border border-outline-variant/10">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-surface-container-low/30">
                    <th className="px-6 py-5 text-[10px] font-black uppercase tracking-widest text-on-surface-variant">ID</th>
                    <th className="px-6 py-5 text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Producto</th>
                    <th className="px-6 py-5 text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Categoría</th>
                    <th className="px-4 py-5 text-[10px] font-black uppercase tracking-widest text-on-surface-variant text-right tracking-tighter">Costo</th>
                    <th className="px-4 py-5 text-[10px] font-black uppercase tracking-widest text-on-surface-variant text-right tracking-tighter">Minorista</th>
                    <th className="px-4 py-5 text-[10px] font-black uppercase tracking-widest text-on-surface-variant text-right tracking-tighter">Mayorista</th>
                    <th className="px-6 py-5 text-[10px] font-black uppercase tracking-widest text-on-surface-variant text-center">Extras</th>
                    <th className="px-6 py-5 text-[10px] font-black uppercase tracking-widest text-on-surface-variant text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/5">
                  {filteredProducts.map((p) => (
                    <tr key={p.id} onClick={() => handleEdit(p)} className="hover:bg-surface-container-low/50 transition-colors cursor-pointer group">
                      <td className="px-6 py-5">
                        <span className="font-mono text-[10px] font-bold text-primary bg-primary/5 px-2 py-1 rounded">#{p.id.slice(0, 8)}</span>
                      </td>
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-surface-container-low flex items-center justify-center text-primary/30 group-hover:bg-primary group-hover:text-white transition-all">
                             <span className="material-symbols-outlined text-xl">inventory_2</span>
                          </div>
                          <div>
                            <p className="font-bold text-sm text-on-background">{p.nombre}</p>
                            <p className="text-[10px] text-on-surface-variant leading-none mt-0.5 line-clamp-1 max-w-[200px]">{p.descripcion || 'Sin descripción'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                          p.categoria === 'Insumos' ? 'bg-emerald-100 text-emerald-700' : 
                          p.categoria === 'Servicios' ? 'bg-orange-100 text-orange-700' : 'bg-indigo-100 text-indigo-700'
                        }`}>
                          {p.categoria || 'S/C'}
                        </span>
                      </td>
                      <td className="px-4 py-5 text-right font-bold text-xs text-on-surface-variant/70">
                        $ {Number(p.precio_costo).toLocaleString('es-AR')}
                      </td>
                      <td className="px-4 py-5 text-right font-headline font-black text-sm text-primary">
                        $ {Number(p.precio_minorista).toLocaleString('es-AR')}
                      </td>
                      <td className="px-4 py-5 text-right font-headline font-extrabold text-sm text-secondary">
                        $ {Number(p.precio_mayorista).toLocaleString('es-AR')}
                      </td>
                      <td className="px-6 py-5">
                        <div className="flex justify-center gap-1.5">
                          {p.requiere_numeracion && (
                            <span title="Requiere Numeración" className="material-symbols-outlined text-lg text-amber-500 bg-amber-50 p-1 rounded-lg">123</span>
                          )}
                          {p.requiere_fecha_muestra && (
                            <span title="Fecha de Muestra" className="material-symbols-outlined text-lg text-blue-500 bg-blue-50 p-1 rounded-lg">calendar_today</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-5" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-2">
                          <button 
                            onClick={() => handleEdit(p)}
                            className="w-8 h-8 flex items-center justify-center text-on-surface-variant hover:text-primary hover:bg-primary/5 rounded-lg transition-all"
                          >
                            <span className="material-symbols-outlined text-xl">edit</span>
                          </button>
                          <button 
                            onClick={() => handleDelete(p.id)}
                            className="w-8 h-8 flex items-center justify-center text-on-surface-variant hover:text-error hover:bg-error/5 rounded-lg transition-all"
                          >
                            <span className="material-symbols-outlined text-xl">delete</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>

      {/* Quick Edit Side Panel */}
      {isPanelOpen && (
        <aside className="w-[380px] min-h-[calc(100vh-140px)] sticky top-24 animate-in slide-in-from-right-8 duration-500">
          <form onSubmit={handleSave} className="bg-white rounded-[2.5rem] shadow-2xl h-full overflow-hidden flex flex-col border border-outline-variant/10">
            <div className="p-8 border-b border-outline-variant/5 flex justify-between items-center bg-surface-container-low/20">
              <div>
                <h3 className="font-headline font-extrabold text-xl text-on-background">
                  {selectedProduct?.id ? 'Editar Producto' : 'Nuevo Producto'}
                </h3>
                <p className="text-[10px] text-on-surface-variant font-black uppercase tracking-widest mt-1">
                  {selectedProduct?.id ? `ID: #${selectedProduct.id.slice(0,8)}` : 'Configuración de Item'}
                </p>
              </div>
              <button 
                type="button"
                onClick={() => setIsPanelOpen(false)}
                className="w-10 h-10 flex items-center justify-center text-on-surface-variant hover:bg-surface-container-low rounded-full transition-colors"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-8 space-y-6">
              <div className="w-full aspect-video rounded-3xl bg-surface-container-low flex flex-col items-center justify-center border-2 border-dashed border-outline-variant/20 text-on-surface-variant/40">
                <span className="material-symbols-outlined text-4xl">add_a_photo</span>
                <p className="text-[10px] font-black uppercase tracking-widest mt-2">Imagen del Producto</p>
              </div>

              <div className="space-y-5">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-[0.15em] text-on-surface-variant px-1">Nombre</label>
                  <input 
                    required
                    className="w-full bg-white border border-outline-variant/20 rounded-xl px-4 py-3 text-sm font-bold focus:ring-2 focus:ring-primary/20 transition-all" 
                    type="text" 
                    value={selectedProduct?.nombre || ''}
                    onChange={(e) => setSelectedProduct(prev => ({ ...prev, nombre: e.target.value }))}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5 col-span-2">
                    <label className="text-[10px] font-black uppercase tracking-[0.15em] text-on-surface-variant px-1">Categoría</label>
                    <select 
                      className="w-full bg-white border border-outline-variant/20 rounded-xl px-4 py-3 text-sm font-bold focus:ring-2 focus:ring-primary/20 transition-all appearance-none"
                      value={selectedProduct?.categoria || 'Insumos'}
                      onChange={(e) => setSelectedProduct(prev => ({ ...prev, categoria: e.target.value }))}
                    >
                      <option>Insumos</option>
                      <option>Servicios</option>
                      <option>Talonarios</option>
                      <option>Folletería</option>
                      <option>Imprenta</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3 bg-surface-container-low/40 p-5 rounded-3xl border border-outline-variant/10">
                  <div className="space-y-1.5">
                    <label className="text-[8px] font-black uppercase tracking-widest text-on-surface-variant block text-center">Costo</label>
                    <input 
                      required
                      className="w-full bg-white border border-outline-variant/20 rounded-xl px-2 py-3 text-xs font-bold text-center focus:ring-2 focus:ring-primary/20 transition-all" 
                      type="number" step="0.01"
                      value={selectedProduct?.precio_costo || 0}
                      onChange={(e) => setSelectedProduct(prev => ({ ...prev, precio_costo: parseFloat(e.target.value) }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[8px] font-black uppercase tracking-widest text-primary block text-center">Minorista</label>
                    <input 
                      required
                      className="w-full bg-primary/5 border border-primary/20 rounded-xl px-2 py-3 text-xs font-black text-center text-primary focus:ring-2 focus:ring-primary/20 transition-all" 
                      type="number" step="0.01"
                      value={selectedProduct?.precio_minorista || 0}
                      onChange={(e) => setSelectedProduct(prev => ({ ...prev, precio_minorista: parseFloat(e.target.value) }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[8px] font-black uppercase tracking-widest text-secondary block text-center">Mayorista</label>
                    <input 
                      required
                      className="w-full bg-secondary/5 border border-secondary/20 rounded-xl px-2 py-3 text-xs font-black text-center text-secondary focus:ring-2 focus:ring-secondary/20 transition-all" 
                      type="number" step="0.01"
                      value={selectedProduct?.precio_mayorista || 0}
                      onChange={(e) => setSelectedProduct(prev => ({ ...prev, precio_mayorista: parseFloat(e.target.value) }))}
                    />
                  </div>
                </div>

                <div className="space-y-3 bg-surface-container-low/20 p-4 rounded-3xl border border-outline-variant/5">
                  <label className="flex items-center gap-3 cursor-pointer group">
                    <div className={`w-10 h-6 rounded-full transition-all relative ${selectedProduct?.requiere_numeracion ? 'bg-primary' : 'bg-outline-variant/30'}`}>
                      <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${selectedProduct?.requiere_numeracion ? 'left-5' : 'left-1'}`}></div>
                    </div>
                    <input 
                      type="checkbox" className="hidden"
                      checked={selectedProduct?.requiere_numeracion || false}
                      onChange={(e) => setSelectedProduct(prev => ({ ...prev, requiere_numeracion: e.target.checked }))}
                    />
                    <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Requiere Numeración</span>
                  </label>

                  <label className="flex items-center gap-3 cursor-pointer group">
                    <div className={`w-10 h-6 rounded-full transition-all relative ${selectedProduct?.requiere_fecha_muestra ? 'bg-primary' : 'bg-outline-variant/30'}`}>
                      <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${selectedProduct?.requiere_fecha_muestra ? 'left-5' : 'left-1'}`}></div>
                    </div>
                    <input 
                      type="checkbox" className="hidden"
                      checked={selectedProduct?.requiere_fecha_muestra || false}
                      onChange={(e) => setSelectedProduct(prev => ({ ...prev, requiere_fecha_muestra: e.target.checked }))}
                    />
                    <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Fecha de Muestra</span>
                  </label>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-[0.15em] text-on-surface-variant px-1">Descripción</label>
                  <textarea 
                    className="w-full bg-white border border-outline-variant/20 rounded-xl px-4 py-3 text-sm font-medium focus:ring-2 focus:ring-primary/20 transition-all resize-none" 
                    rows={3}
                    value={selectedProduct?.descripcion || ''}
                    onChange={(e) => setSelectedProduct(prev => ({ ...prev, descripcion: e.target.value }))}
                  />
                </div>
              </div>
            </div>

            <div className="p-8 bg-surface-container-low/20 border-t border-outline-variant/5 grid grid-cols-2 gap-4">
              <button 
                type="button"
                onClick={() => setIsPanelOpen(false)}
                className="px-6 py-3 rounded-xl border border-outline-variant/30 text-on-background font-bold text-xs uppercase tracking-widest hover:bg-white transition-colors"
              >
                Cancelar
              </button>
              <button 
                type="submit"
                disabled={saving}
                className="px-6 py-3 rounded-xl bg-primary text-white font-headline font-bold text-xs uppercase tracking-widest shadow-lg shadow-primary/20 hover:brightness-110 active:scale-95 disabled:opacity-50 transition-all"
              >
                {saving ? 'Guardando...' : 'Confirmar'}
              </button>
            </div>
          </form>
        </aside>
      )}
    </div>
  );
};

export default ProductsPage;
