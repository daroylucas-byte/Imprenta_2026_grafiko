import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { toast } from 'react-hot-toast';
import SupplierModal from '../components/SupplierModal';
import SupplierLedgerModal from '../components/SupplierLedgerModal';
import SupplierPaymentModal from '../components/SupplierPaymentModal';

interface Supplier {
  id: string;
  nombre: string;
  razon_social?: string | null;
  cuit?: string | null;
  contacto?: string | null;
  direccion?: string | null;
  localidad?: string | null;
  telefonos?: string | null;
  email?: string | null;
  observaciones?: string | null;
  condicion_pago: 'contado' | 'cuenta_corriente';
  limite_credito: number;
  activo: boolean;
  created_at: string;
  total_cargos?: number;
  total_notas_debito?: number;
  total_pagos?: number;
  total_notas_credito?: number;
  saldo_pendiente?: number;
}

const normalizeText = (s: unknown) =>
  String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

const SuppliersPage: React.FC = () => {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLedgerOpen, setIsLedgerOpen] = useState(false);
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  const [selectedSupplierId, setSelectedSupplierId] = useState<string | null>(null);
  const [activeSupplier, setActiveSupplier] = useState<Supplier | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'activos' | 'inactivos' | 'todos'>('activos');
  const [soloConDeuda, setSoloConDeuda] = useState(false);

  const fetchSuppliers = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('v_saldo_proveedores')
        .select('*')
        .order('nombre', { ascending: true });

      if (error) throw error;
      setSuppliers((data || []) as Supplier[]);
    } catch (error: any) {
      toast.error('Error al cargar proveedores: ' + error.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSuppliers();
  }, [fetchSuppliers]);

  const handleToggleActivo = async (supplier: Supplier) => {
    const nuevoEstado = !supplier.activo;
    if (
      nuevoEstado === false &&
      !window.confirm(
        `¿Inactivar al proveedor ${supplier.nombre}? No podrás seleccionarlo para nuevas compras, pero su historial se conserva intacto.`
      )
    ) {
      return;
    }

    try {
      const { error } = await supabase
        .from('t_proveedores')
        .update({ activo: nuevoEstado })
        .eq('id', supplier.id);

      if (error) throw error;
      toast.success(nuevoEstado ? 'Proveedor reactivado' : 'Proveedor inactivado');
      fetchSuppliers();
    } catch (error: any) {
      toast.error('Error al actualizar proveedor: ' + error.message);
    }
  };

  const supplierMatchesSearch = (s: Supplier) => {
    const words = normalizeText(searchTerm).split(/\s+/).filter(Boolean);
    if (words.length === 0) return true;
    const haystack = normalizeText([
      s.nombre,
      s.razon_social,
      s.cuit,
      s.contacto,
      s.email,
      s.telefonos,
      s.direccion,
      s.localidad,
      s.observaciones,
      String(s.cuit ?? '').replace(/\D/g, ''),
      String(s.telefonos ?? '').replace(/\D/g, ''),
    ].filter(v => v !== null && v !== undefined && v !== '').join(' '));
    return words.every(w => haystack.includes(w));
  };

  const filteredSuppliers = suppliers.filter((s) => {
    if (activeTab === 'activos' && s.activo === false) return false;
    if (activeTab === 'inactivos' && s.activo !== false) return false;
    if (soloConDeuda && Number(s.saldo_pendiente || 0) <= 0) return false;
    return supplierMatchesSearch(s);
  });

  // Métricas
  const activeSuppliersList = suppliers.filter((s) => s.activo !== false);
  const totalActiveSuppliers = activeSuppliersList.length;

  const totalDeuda = activeSuppliersList.reduce((acc, s) => {
    const saldo = Number(s.saldo_pendiente || 0);
    return saldo > 0 ? acc + saldo : acc;
  }, 0);

  const cantProveedoresConDeuda = activeSuppliersList.filter((s) => Number(s.saldo_pendiente || 0) > 0).length;

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in duration-700">
      {/* Metrics Section */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-surface-container-lowest p-8 rounded-[2rem] border border-outline-variant/10 shadow-sm flex flex-col justify-between group hover:border-primary/20 transition-all">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white transition-all">
              <span className="material-symbols-outlined">factory</span>
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
                Proveedores Activos
              </p>
              <h3 className="text-3xl font-headline font-extrabold text-on-surface">{totalActiveSuppliers}</h3>
            </div>
          </div>
          <p className="text-[10px] font-bold text-outline uppercase tracking-wider">
            Total en cartera comercial
          </p>
        </div>

        <div className="bg-surface-container-lowest p-8 rounded-[2rem] border border-outline-variant/10 shadow-sm flex flex-col justify-between group hover:border-error/20 transition-all">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 rounded-2xl bg-error/10 flex items-center justify-center text-error group-hover:bg-error group-hover:text-white transition-all">
              <span className="material-symbols-outlined">trending_down</span>
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
                Deuda Total
              </p>
              <h3 className="text-2xl lg:text-3xl font-headline font-extrabold text-error">
                ${totalDeuda.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
              </h3>
            </div>
          </div>
          <p className="text-[10px] font-bold text-outline uppercase tracking-wider">
            Saldo a pagar a proveedores
          </p>
        </div>

        <div className="bg-surface-container-lowest p-8 rounded-[2rem] border border-outline-variant/10 shadow-sm flex flex-col justify-between group hover:border-amber-500/20 transition-all">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 flex items-center justify-center text-amber-600 group-hover:bg-amber-500 group-hover:text-white transition-all">
              <span className="material-symbols-outlined">pending_actions</span>
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
                Cuentas con Deuda
              </p>
              <h3 className="text-3xl font-headline font-extrabold text-on-surface">
                {cantProveedoresConDeuda}
              </h3>
            </div>
          </div>
          <p className="text-[10px] font-bold text-outline uppercase tracking-wider">
            Proveedores a los que se les debe
          </p>
        </div>

        <div
          className="bg-gradient-to-br from-slate-900 to-slate-800 p-8 rounded-[2rem] shadow-xl flex items-center justify-between group cursor-pointer hover:scale-[0.98] transition-all"
          onClick={() => {
            setSelectedSupplierId(null);
            setIsModalOpen(true);
          }}
        >
          <div className="text-white space-y-1">
            <h4 className="text-lg font-headline font-extrabold tracking-tight">Nuevo Proveedor</h4>
            <p className="text-slate-400 text-xs font-bold uppercase tracking-widest leading-none">
              Registrar entidad
            </p>
          </div>
          <div className="w-14 h-14 bg-white/10 rounded-2xl flex items-center justify-center text-white backdrop-blur-md group-hover:bg-primary transition-colors">
            <span className="material-symbols-outlined text-3xl">add_business</span>
          </div>
        </div>
      </div>

      {/* Main Table Section */}
      <div className="bg-surface-container-lowest rounded-[2.5rem] shadow-sm border border-outline-variant/10 overflow-hidden">
        {/* Header con Buscador */}
        <div className="p-8 border-b border-outline-variant/5 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-4">
            <h2 className="text-2xl font-headline font-extrabold text-on-surface tracking-tight">
              Directorio de Proveedores
            </h2>
            <button
              onClick={() => {
                setSelectedSupplierId(null);
                setIsModalOpen(true);
              }}
              className="hidden sm:flex items-center gap-2 px-4 py-2 bg-primary text-white text-xs font-bold rounded-xl shadow-md shadow-primary/20 hover:brightness-110 active:scale-95 transition-all"
            >
              <span className="material-symbols-outlined text-sm">add</span>
              Nuevo Proveedor
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
                placeholder="Buscar por nombre, CUIT, contacto, teléfono, localidad..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Filtros: Tabs + Checkbox Solo con Deuda */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between px-8 bg-white border-b border-outline-variant/5 gap-4">
          <div className="flex">
            <button
              onClick={() => setActiveTab('activos')}
              className={`px-6 py-4 text-[10px] font-black uppercase tracking-[0.2em] transition-all border-b-2 ${
                activeTab === 'activos' ? 'border-primary text-primary' : 'border-transparent text-outline'
              }`}
            >
              Activos ({suppliers.filter((s) => s.activo !== false).length})
            </button>
            <button
              onClick={() => setActiveTab('inactivos')}
              className={`px-6 py-4 text-[10px] font-black uppercase tracking-[0.2em] transition-all border-b-2 ${
                activeTab === 'inactivos' ? 'border-primary text-primary' : 'border-transparent text-outline'
              }`}
            >
              Inactivos ({suppliers.filter((s) => s.activo === false).length})
            </button>
            <button
              onClick={() => setActiveTab('todos')}
              className={`px-6 py-4 text-[10px] font-black uppercase tracking-[0.2em] transition-all border-b-2 ${
                activeTab === 'todos' ? 'border-primary text-primary' : 'border-transparent text-outline'
              }`}
            >
              Todos ({suppliers.length})
            </button>
          </div>

          <label className="flex items-center gap-2 cursor-pointer py-2 sm:py-0 select-none">
            <input
              type="checkbox"
              checked={soloConDeuda}
              onChange={(e) => setSoloConDeuda(e.target.checked)}
              className="w-4 h-4 rounded text-primary focus:ring-primary/20 border-outline-variant/30"
            />
            <span className="text-xs font-bold text-on-surface-variant">Solo con deuda</span>
          </label>
        </div>

        {/* Tabla en escritorio / Tarjetas en móvil */}
        <div className="overflow-x-auto no-scrollbar">
          {loading ? (
            <div className="h-64 flex flex-col items-center justify-center space-y-4 text-primary/30">
              <div className="w-10 h-10 border-4 border-primary/10 border-t-primary rounded-full animate-spin"></div>
              <p className="text-[10px] font-black uppercase tracking-widest">Sincronizando Proveedores...</p>
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface-container-low/30">
                  <th className="px-8 py-5 text-[10px] font-black text-on-surface-variant uppercase tracking-widest">
                    Proveedor
                  </th>
                  <th className="px-6 py-5 text-[10px] font-black text-on-surface-variant uppercase tracking-widest">
                    CUIT
                  </th>
                  <th className="px-6 py-5 text-[10px] font-black text-on-surface-variant uppercase tracking-widest">
                    Contacto / Teléfono
                  </th>
                  <th className="px-6 py-5 text-[10px] font-black text-on-surface-variant uppercase tracking-widest">
                    Condición
                  </th>
                  <th className="px-6 py-5 text-[10px] font-black text-on-surface-variant uppercase tracking-widest">
                    Saldo
                  </th>
                  <th className="px-8 py-5 text-[10px] font-black text-on-surface-variant uppercase tracking-widest text-center">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/5">
                {filteredSuppliers.map((supplier, i) => {
                  const saldo = Number(supplier.saldo_pendiente || 0);
                  const limiteCredito = Number(supplier.limite_credito || 0);
                  const excedeLimite = limiteCredito > 0 && saldo > limiteCredito;

                  return (
                    <tr
                      key={supplier.id}
                      className="hover:bg-surface-container-high transition-colors group cursor-pointer animate-in fade-in slide-in-from-right-4 duration-300"
                      style={{ animationDelay: `${i * 25}ms` }}
                      onClick={() => {
                        setActiveSupplier(supplier);
                        setIsLedgerOpen(true);
                      }}
                    >
                      {/* Proveedor y Razón Social */}
                      <td className="px-8 py-5">
                        <p className="text-sm font-headline font-extrabold text-on-surface group-hover:text-primary transition-colors">
                          {supplier.nombre}
                        </p>
                        {supplier.razon_social && supplier.razon_social !== supplier.nombre ? (
                          <p className="text-[11px] text-on-surface-variant font-bold">
                            {supplier.razon_social}
                          </p>
                        ) : null}
                        {supplier.localidad && (
                          <p className="text-[10px] text-outline font-medium tracking-tight">
                            {supplier.localidad}
                          </p>
                        )}
                      </td>

                      {/* CUIT */}
                      <td className="px-6 py-5 text-sm font-bold text-secondary">
                        {supplier.cuit || '---'}
                      </td>

                      {/* Contacto / Teléfono */}
                      <td className="px-6 py-5">
                        <p className="text-xs font-bold text-on-surface">
                          {supplier.contacto || '---'}
                        </p>
                        {supplier.telefonos ? (
                          <p className="text-[10px] text-on-surface-variant font-medium">
                            {supplier.telefonos}
                          </p>
                        ) : null}
                      </td>

                      {/* Condición de Pago */}
                      <td className="px-6 py-5">
                        <span
                          className={`px-2.5 py-1 text-[9px] font-black uppercase rounded-lg border tracking-widest inline-block ${
                            supplier.condicion_pago === 'cuenta_corriente'
                              ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                              : 'bg-surface-container-low text-on-surface-variant border-outline-variant/10'
                          }`}
                        >
                          {supplier.condicion_pago === 'cuenta_corriente'
                            ? 'Cuenta corriente'
                            : 'Contado'}
                        </span>
                        {limiteCredito > 0 && (
                          <p className="text-[9px] font-bold text-outline uppercase tracking-tight mt-1">
                            Límite: ${limiteCredito.toLocaleString('es-AR')}
                          </p>
                        )}
                      </td>

                      {/* Saldo */}
                      <td className="px-6 py-5">
                        {saldo > 0 ? (
                          <div>
                            <p className="text-sm font-black text-error">
                              $ {saldo.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                            </p>
                            <p className="text-[9px] font-bold text-error uppercase tracking-tighter">
                              Le debemos
                            </p>
                          </div>
                        ) : saldo === 0 ? (
                          <div>
                            <p className="text-sm font-black text-emerald-600">$ 0,00</p>
                            <p className="text-[9px] font-bold text-emerald-600 uppercase tracking-tighter">
                              Sin deuda
                            </p>
                          </div>
                        ) : (
                          <div>
                            <p className="text-sm font-black text-emerald-600">
                              $ {Math.abs(saldo).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                            </p>
                            <p className="text-[9px] font-bold text-emerald-600 uppercase tracking-tighter">
                              A favor
                            </p>
                          </div>
                        )}

                        {excedeLimite && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 mt-1 bg-amber-50 text-amber-700 border border-amber-200 text-[8px] font-black uppercase rounded tracking-tighter">
                            <span className="material-symbols-outlined text-[10px]">warning</span>
                            Excede límite
                          </span>
                        )}
                      </td>

                      {/* Acciones */}
                      <td className="px-8 py-5 text-center">
                        <div className="flex justify-center items-center gap-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveSupplier(supplier);
                              setIsLedgerOpen(true);
                            }}
                            title="Ver Cuenta Corriente"
                            className="bg-indigo-50 text-indigo-600 hover:bg-indigo-600 hover:text-white transition-all p-2 rounded-xl border border-indigo-100 shadow-sm"
                          >
                            <span className="material-symbols-outlined text-lg">
                              account_balance_wallet
                            </span>
                          </button>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveSupplier(supplier);
                              setIsPaymentOpen(true);
                            }}
                            title="Registrar Pago"
                            className="bg-emerald-50 text-emerald-600 hover:bg-emerald-600 hover:text-white transition-all p-2 rounded-xl border border-emerald-100 shadow-sm"
                          >
                            <span className="material-symbols-outlined text-lg">payments</span>
                          </button>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedSupplierId(supplier.id);
                              setIsModalOpen(true);
                            }}
                            title="Editar Proveedor"
                            className="bg-slate-50 text-slate-600 hover:bg-primary hover:text-white transition-all p-2 rounded-xl border border-slate-100 shadow-sm"
                          >
                            <span className="material-symbols-outlined text-lg">edit</span>
                          </button>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleActivo(supplier);
                            }}
                            title={supplier.activo !== false ? 'Inactivar Proveedor' : 'Reactivar Proveedor'}
                            className={
                              supplier.activo !== false
                                ? 'bg-error/5 text-error hover:bg-error hover:text-white transition-all p-2 rounded-xl border border-error/10 shadow-sm'
                                : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-600 hover:text-white transition-all p-2 rounded-xl border border-emerald-100 shadow-sm'
                            }
                          >
                            <span className="material-symbols-outlined text-lg">
                              {supplier.activo !== false ? 'block' : 'check_circle'}
                            </span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {!loading && filteredSuppliers.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-20 text-center text-outline/40 italic text-sm">
                      {searchTerm
                        ? `No se encontraron proveedores para la búsqueda "${searchTerm}"`
                        : soloConDeuda
                        ? 'No hay proveedores con deuda pendiente'
                        : activeTab === 'activos'
                        ? 'No hay proveedores activos'
                        : activeTab === 'inactivos'
                        ? 'No hay proveedores inactivos'
                        : 'No hay proveedores registrados'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Modales */}
      {/* Modal de Cuenta Corriente */}
      {isLedgerOpen && activeSupplier && (
        <SupplierLedgerModal
          supplier={activeSupplier}
          onClose={() => {
            setIsLedgerOpen(false);
            setActiveSupplier(null);
          }}
          onSuccess={fetchSuppliers}
        />
      )}

      {/* Modal de Pago */}
      {isPaymentOpen && activeSupplier && (
        <SupplierPaymentModal
          supplier={activeSupplier}
          onClose={() => {
            setIsPaymentOpen(false);
            setActiveSupplier(null);
          }}
          onSuccess={fetchSuppliers}
        />
      )}

      {/* Modal de Alta / Edición */}
      {isModalOpen && (
        <SupplierModal
          supplierId={selectedSupplierId || undefined}
          onClose={() => {
            setIsModalOpen(false);
            setSelectedSupplierId(null);
          }}
          onSuccess={fetchSuppliers}
        />
      )}
    </div>
  );
};

export default SuppliersPage;
