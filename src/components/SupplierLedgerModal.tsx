import React, { useState, useEffect, useCallback } from 'react';
import { formatDateAR } from '../utils/dates';
import { supabase } from '../lib/supabase';
import { toast } from 'react-hot-toast';
import SupplierPaymentModal from './SupplierPaymentModal';
import SupplierAdjustmentModal from './SupplierAdjustmentModal';

interface SupplierLedgerItem {
  id: string;
  proveedor_id: string;
  fecha: string;
  created_at: string;
  tipo: 'cargo' | 'pago' | 'nota_credito' | 'nota_debito';
  monto: number;
  concepto: string;
  forma_pago?: string | null;
  referencia?: string | null;
  compra_id?: string | null;
  saldo_acumulado: number;
}

interface SupplierLedgerModalProps {
  supplier: {
    id: string;
    nombre: string;
    razon_social?: string | null;
    saldo_pendiente?: number;
    total_cargos?: number;
    total_notas_debito?: number;
    total_pagos?: number;
    total_notas_credito?: number;
  };
  onClose: () => void;
  onSuccess: () => void;
}

const TIPO_BADGES: Record<string, { label: string; classes: string; sign: '+' | '−'; color: string }> = {
  cargo: {
    label: 'Cargo',
    classes: 'bg-error/10 text-error border-error/20',
    sign: '+',
    color: 'text-error',
  },
  nota_debito: {
    label: 'Nota de débito',
    classes: 'bg-amber-50 text-amber-700 border-amber-200',
    sign: '+',
    color: 'text-error',
  },
  pago: {
    label: 'Pago',
    classes: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    sign: '−',
    color: 'text-emerald-600',
  },
  nota_credito: {
    label: 'Nota de crédito',
    classes: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    sign: '−',
    color: 'text-emerald-600',
  },
};

const SupplierLedgerModal: React.FC<SupplierLedgerModalProps> = ({
  supplier: initialSupplier,
  onClose,
  onSuccess,
}) => {
  const [loading, setLoading] = useState(true);
  const [currentSupplier, setCurrentSupplier] = useState<any>(initialSupplier);
  const [ledger, setLedger] = useState<SupplierLedgerItem[]>([]);
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  const [isAdjustmentOpen, setIsAdjustmentOpen] = useState(false);

  const fetchLedger = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Obtener saldo y totales actualizados de la vista
      const { data: supData, error: supError } = await supabase
        .from('v_saldo_proveedores')
        .select('*')
        .eq('id', initialSupplier.id)
        .single();

      if (!supError && supData) {
        setCurrentSupplier(supData);
      }

      // 2. Obtener movimientos de cuenta corriente
      const { data: items, error: ledgerError } = await supabase
        .from('v_cuenta_corriente_proveedor')
        .select('*')
        .eq('proveedor_id', initialSupplier.id)
        .order('fecha', { ascending: false })
        .order('created_at', { ascending: false });

      if (ledgerError) throw ledgerError;

      setLedger((items || []) as SupplierLedgerItem[]);
    } catch (err: any) {
      console.error('Fetch ledger error:', err);
      toast.error('Error al cargar cuenta corriente: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [initialSupplier.id]);

  useEffect(() => {
    fetchLedger();
  }, [fetchLedger]);

  const handleActionSuccess = () => {
    fetchLedger();
    onSuccess();
  };

  const saldoPendiente = Number(currentSupplier?.saldo_pendiente ?? initialSupplier?.saldo_pendiente ?? 0);
  const totalCargos = Number(currentSupplier?.total_cargos ?? initialSupplier?.total_cargos ?? 0);
  const totalDebitos = Number(currentSupplier?.total_notas_debito ?? initialSupplier?.total_notas_debito ?? 0);
  const totalPagos = Number(currentSupplier?.total_pagos ?? initialSupplier?.total_pagos ?? 0);
  const totalCreditos = Number(currentSupplier?.total_notas_credito ?? initialSupplier?.total_notas_credito ?? 0);

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300">
      <div className="bg-white w-full max-w-5xl h-[88vh] rounded-[3rem] shadow-2xl border border-white/20 flex flex-col overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-12 duration-500">
        {/* Header */}
        <div className="px-10 py-8 border-b border-outline-variant/10 flex justify-between items-center bg-slate-50">
          <div>
            <div className="flex items-center gap-3">
              <h3 className="text-3xl font-headline font-extrabold text-on-surface tracking-tight">
                Cuenta Corriente
              </h3>
              <span className="px-3 py-1 bg-primary/10 text-primary rounded-full text-[10px] font-black uppercase tracking-widest leading-none">
                Proveedor
              </span>
            </div>
            <p className="text-xs text-on-surface-variant font-bold uppercase tracking-widest mt-1">
              Proveedor:{' '}
              <span className="text-primary font-black">
                {currentSupplier?.nombre || initialSupplier.nombre}
              </span>
              {currentSupplier?.razon_social && currentSupplier.razon_social !== currentSupplier.nombre ? (
                <span className="text-on-surface-variant/80 ml-1">({currentSupplier.razon_social})</span>
              ) : null}
            </p>
          </div>

          <div className="flex items-center gap-6">
            <div className="text-right">
              <p className="text-[10px] font-black text-outline uppercase tracking-widest leading-none mb-1">
                Saldo Pendiente
              </p>
              <p
                className={`text-2xl font-black ${
                  saldoPendiente > 0 ? 'text-error' : saldoPendiente < 0 ? 'text-emerald-600' : 'text-on-surface'
                }`}
              >
                ${Math.abs(saldoPendiente).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                <span className="text-[10px] ml-1 uppercase font-black">
                  {saldoPendiente > 0 ? 'Le debemos' : saldoPendiente < 0 ? 'A favor' : 'Sin deuda'}
                </span>
              </p>
            </div>
            <button
              onClick={onClose}
              title="Cerrar"
              className="p-3 hover:bg-error/10 text-on-surface-variant hover:text-error rounded-2xl transition-all"
            >
              <span className="material-symbols-outlined text-3xl">close</span>
            </button>
          </div>
        </div>

        {/* Totals Summary Bar */}
        <div className="grid grid-cols-2 md:grid-cols-5 divide-y md:divide-y-0 md:divide-x divide-outline-variant/10 bg-white border-b border-outline-variant/5">
          <div className="px-6 py-5">
            <p className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest mb-1 opacity-60">
              Total Cargos
            </p>
            <p className="text-lg font-black text-on-surface">
              ${totalCargos.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
            </p>
          </div>

          <div className="px-6 py-5">
            <p className="text-[10px] font-black text-amber-700 uppercase tracking-widest mb-1">
              Notas de Débito
            </p>
            <p className="text-lg font-black text-amber-700">
              ${totalDebitos.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
            </p>
          </div>

          <div className="px-6 py-5 bg-emerald-50/30">
            <p className="text-[10px] font-black text-emerald-700 uppercase tracking-widest mb-1">
              Total Pagos
            </p>
            <p className="text-lg font-black text-emerald-700">
              ${totalPagos.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
            </p>
          </div>

          <div className="px-6 py-5 bg-indigo-50/30">
            <p className="text-[10px] font-black text-indigo-700 uppercase tracking-widest mb-1">
              Notas de Crédito
            </p>
            <p className="text-lg font-black text-indigo-700">
              ${totalCreditos.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
            </p>
          </div>

          {/* Botones de acción directa */}
          <div className="px-6 py-4 col-span-2 md:col-span-1 flex flex-col justify-center gap-2 bg-slate-50">
            <button
              onClick={() => setIsPaymentOpen(true)}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-md shadow-emerald-600/20 hover:bg-emerald-500 active:scale-95 transition-all"
            >
              <span className="material-symbols-outlined text-base">payments</span>
              Registrar Pago
            </button>
            <button
              onClick={() => setIsAdjustmentOpen(true)}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-white text-indigo-700 border border-indigo-200 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-50 active:scale-95 transition-all shadow-sm"
            >
              <span className="material-symbols-outlined text-base">receipt_long</span>
              Ajustar Saldo
            </button>
          </div>
        </div>

        {/* Ledger Table Section */}
        <div className="flex-1 overflow-y-auto no-scrollbar p-10 bg-slate-50/20">
          {loading ? (
            <div className="h-full flex flex-col items-center justify-center space-y-4">
              <div className="w-12 h-12 border-4 border-primary/10 border-t-primary rounded-full animate-spin"></div>
              <p className="text-xs font-black uppercase tracking-widest text-outline">
                Cargando cuenta corriente...
              </p>
            </div>
          ) : ledger.length > 0 ? (
            <table className="w-full text-left border-separate border-spacing-y-3">
              <thead>
                <tr>
                  <th className="px-6 py-2 text-[10px] font-black text-on-surface-variant uppercase tracking-widest">
                    Fecha
                  </th>
                  <th className="px-6 py-2 text-[10px] font-black text-on-surface-variant uppercase tracking-widest">
                    Tipo
                  </th>
                  <th className="px-6 py-2 text-[10px] font-black text-on-surface-variant uppercase tracking-widest">
                    Concepto / Referencia
                  </th>
                  <th className="px-6 py-2 text-[10px] font-black text-on-surface-variant uppercase tracking-widest text-right">
                    Monto
                  </th>
                  <th className="px-6 py-2 text-[10px] font-black text-on-surface-variant uppercase tracking-widest text-right">
                    Saldo Acumulado
                  </th>
                </tr>
              </thead>
              <tbody>
                {ledger.map((item, idx) => {
                  const badge = TIPO_BADGES[item.tipo] || {
                    label: item.tipo,
                    classes: 'bg-slate-100 text-slate-700 border-slate-200',
                    sign: '+',
                    color: 'text-on-surface',
                  };
                  const montoNum = Number(item.monto || 0);
                  const saldoAcumNum = Number(item.saldo_acumulado || 0);

                  return (
                    <tr
                      key={item.id || idx}
                      className="group animate-in fade-in slide-in-from-right-4 duration-300"
                      style={{ animationDelay: `${idx * 20}ms` }}
                    >
                      <td className="bg-white px-6 py-4 rounded-l-3xl border-y border-l border-outline-variant/10">
                        <p className="text-sm font-bold text-on-surface">{formatDateAR(item.fecha)}</p>
                      </td>
                      <td className="bg-white px-6 py-4 border-y border-outline-variant/10">
                        <span
                          className={`px-2.5 py-1 text-[9px] font-black uppercase rounded-lg border tracking-widest ${badge.classes}`}
                        >
                          {badge.label}
                        </span>
                      </td>
                      <td className="bg-white px-6 py-4 border-y border-outline-variant/10">
                        <p className="text-sm font-bold text-on-surface">{item.concepto || 'Sin concepto'}</p>
                        {(item.forma_pago || item.referencia) && (
                          <p className="text-[10px] text-on-surface-variant font-bold mt-0.5">
                            {item.forma_pago ? <span className="text-primary mr-2">{item.forma_pago}</span> : null}
                            {item.referencia ? <span>Ref: {item.referencia}</span> : null}
                          </p>
                        )}
                      </td>
                      <td className="bg-white px-6 py-4 border-y border-outline-variant/10 text-right">
                        <span className={`text-sm font-black ${badge.color}`}>
                          {badge.sign} ${montoNum.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                        </span>
                      </td>
                      <td className="bg-white px-6 py-4 rounded-r-3xl border-y border-r border-outline-variant/10 text-right">
                        <span
                          className={`text-sm font-black ${
                            saldoAcumNum > 0 ? 'text-error' : saldoAcumNum < 0 ? 'text-emerald-600' : 'text-on-surface'
                          }`}
                        >
                          ${saldoAcumNum.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div className="h-64 flex flex-col items-center justify-center text-outline/30 space-y-4">
              <span className="material-symbols-outlined text-6xl">account_balance_wallet</span>
              <p className="text-xs font-black uppercase tracking-widest">
                Todavía no hay movimientos con este proveedor
              </p>
            </div>
          )}
        </div>

        {/* Footer info */}
        <div className="px-10 py-5 bg-white border-t border-outline-variant/10 flex justify-between items-center text-[10px] font-bold text-outline uppercase tracking-widest">
          <p>Cálculo consolidado desde la cuenta corriente del proveedor</p>
          <button
            onClick={onClose}
            className="px-6 py-2.5 bg-slate-100 text-on-surface hover:bg-slate-200 rounded-xl transition-all"
          >
            Cerrar
          </button>
        </div>
      </div>

      {/* Sub-modales de pago y ajuste */}
      {isPaymentOpen && (
        <SupplierPaymentModal
          supplier={currentSupplier || initialSupplier}
          onClose={() => setIsPaymentOpen(false)}
          onSuccess={handleActionSuccess}
        />
      )}

      {isAdjustmentOpen && (
        <SupplierAdjustmentModal
          supplier={currentSupplier || initialSupplier}
          onClose={() => setIsAdjustmentOpen(false)}
          onSuccess={handleActionSuccess}
        />
      )}
    </div>
  );
};

export default SupplierLedgerModal;
