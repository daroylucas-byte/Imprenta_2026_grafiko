import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { formatDateAR } from '../utils/dates';
import { toast } from 'react-hot-toast';
import { useAuthStore } from '../store/authStore';

export interface CompraRow {
  id: string;
  proveedor_id: string;
  proveedor_nombre: string;
  fecha: string;
  nro_comprobante?: string | null;
  estado: 'recibida' | 'anulada';
  condicion_pago: 'contado' | 'cuenta_corriente';
  forma_pago?: string | null;
  total: number;
  observaciones?: string | null;
  anulada_at?: string | null;
  motivo_anulacion?: string | null;
  usuario_id?: string | null;
  created_at: string;
  cantidad_items?: number;
}

interface CompraItemRow {
  id: string;
  compra_id: string;
  insumo_id: string;
  insumo_nombre: string;
  unidad_stock_nombre: string;
  unidad_compra_nombre?: string | null;
  factor_compra: number;
  cantidad: number;
  en_unidad_compra: boolean;
  costo_unitario: number;
  cantidad_stock: number;
  subtotal: number;
  created_at: string;
}

interface PurchaseDetailModalProps {
  purchase: CompraRow;
  onClose: () => void;
  onSuccess: () => void;
}

const PurchaseDetailModal: React.FC<PurchaseDetailModalProps> = ({ purchase, onClose, onSuccess }) => {
  const [items, setItems] = useState<CompraItemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAnularConfirm, setShowAnularConfirm] = useState(false);
  const [motivoAnulacion, setMotivoAnulacion] = useState('');
  const [anulando, setAnulando] = useState(false);
  const { user } = useAuthStore();

  useEffect(() => {
    const fetchItems = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('v_compra_items')
          .select('*')
          .eq('compra_id', purchase.id);

        if (error) throw error;
        setItems((data || []) as CompraItemRow[]);
      } catch (err: any) {
        console.error('Error fetching purchase items:', err);
        toast.error('Error al cargar ítems de la compra: ' + err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchItems();
  }, [purchase.id]);

  const handleAnularCompra = async () => {
    const motivoTrimmed = motivoAnulacion.trim();
    if (!motivoTrimmed) {
      toast.error('El motivo de anulación es obligatorio');
      return;
    }

    setAnulando(true);
    try {
      const { data, error } = await supabase.rpc('anular_compra', {
        p_compra_id: purchase.id,
        p_motivo: motivoTrimmed,
        p_usuario_id: user?.id || null,
      });

      if (error) throw error;

      toast.success('Compra anulada.');

      const resultado = data && data[0];
      const insumosNegativos = Number(resultado?.insumos_en_negativo || 0);
      if (insumosNegativos > 0) {
        toast(`${insumosNegativos} insumo(s) quedaron con stock negativo: revisá si ya se consumieron.`, {
          icon: '⚠️',
          duration: 6000,
        });
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Error voiding purchase:', err);
      toast.error(err.message || 'Error al anular la compra');
    } finally {
      setAnulando(false);
    }
  };

  const isAnulada = purchase.estado === 'anulada';

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300">
      <div className="bg-white w-full max-w-3xl max-h-[90vh] rounded-[2.5rem] shadow-2xl border border-white/20 flex flex-col overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-12 duration-500">
        {/* Header */}
        <div className="px-10 py-8 border-b border-outline-variant/10 flex justify-between items-start bg-surface-container-low/30 shrink-0">
          <div>
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-primary text-2xl">receipt_long</span>
              <h3 className="text-2xl font-headline font-extrabold text-on-surface tracking-tight">
                Detalle de Compra
              </h3>
              <span
                className={`px-2.5 py-1 text-[9px] font-black uppercase rounded-lg border tracking-widest ${
                  isAnulada
                    ? 'bg-error/10 text-error border-error/20'
                    : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                }`}
              >
                {isAnulada ? 'Anulada' : 'Recibida'}
              </span>
            </div>
            <p className="text-lg font-headline font-extrabold text-on-surface mt-1">
              {purchase.proveedor_nombre}
            </p>
          </div>
          <button
            onClick={onClose}
            title="Cerrar"
            className="p-2 hover:bg-error/10 text-on-surface-variant hover:text-error rounded-full transition-all active:scale-90"
          >
            <span className="material-symbols-outlined text-2xl">close</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-10 space-y-6 overflow-y-auto max-h-[75vh]">
          {/* Metadata Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-surface-container-low/50 p-4 rounded-2xl border border-outline-variant/10">
              <p className="text-[9px] font-black text-on-surface-variant uppercase tracking-widest">
                Fecha
              </p>
              <p className="text-sm font-headline font-extrabold text-on-surface mt-0.5">
                {formatDateAR(purchase.fecha)}
              </p>
            </div>

            <div className="bg-surface-container-low/50 p-4 rounded-2xl border border-outline-variant/10">
              <p className="text-[9px] font-black text-on-surface-variant uppercase tracking-widest">
                Comprobante
              </p>
              <p className="text-sm font-headline font-extrabold text-on-surface mt-0.5 truncate">
                {purchase.nro_comprobante || '—'}
              </p>
            </div>

            <div className="bg-surface-container-low/50 p-4 rounded-2xl border border-outline-variant/10">
              <p className="text-[9px] font-black text-on-surface-variant uppercase tracking-widest">
                Condición
              </p>
              <p className="text-sm font-headline font-extrabold text-on-surface mt-0.5">
                {purchase.condicion_pago === 'contado'
                  ? `Contado (${purchase.forma_pago || 'Efectivo'})`
                  : 'Cuenta corriente'}
              </p>
            </div>

            <div className="bg-surface-container-low/50 p-4 rounded-2xl border border-outline-variant/10">
              <p className="text-[9px] font-black text-on-surface-variant uppercase tracking-widest">
                Total
              </p>
              <p
                className={`text-lg font-headline font-extrabold mt-0.5 ${
                  isAnulada ? 'line-through text-outline' : 'text-primary'
                }`}
              >
                ${Number(purchase.total).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
              </p>
            </div>
          </div>

          {/* Observaciones si existen */}
          {purchase.observaciones && (
            <div className="p-4 bg-surface-container-low/30 rounded-2xl border border-outline-variant/10">
              <p className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest mb-1">
                Observaciones
              </p>
              <p className="text-xs font-medium text-on-surface">{purchase.observaciones}</p>
            </div>
          )}

          {/* Bloque de compra anulada */}
          {isAnulada && (
            <div className="p-5 bg-error/5 border border-error/20 rounded-2xl space-y-1 animate-in fade-in duration-300">
              <div className="flex items-center gap-2 text-error">
                <span className="material-symbols-outlined text-lg">cancel</span>
                <h4 className="text-xs font-black uppercase tracking-wider">Compra Anulada</h4>
              </div>
              <p className="text-xs text-on-surface font-bold">
                Anulada el:{' '}
                {purchase.anulada_at
                  ? new Date(purchase.anulada_at).toLocaleString('es-AR', {
                      timeZone: 'America/Argentina/Buenos_Aires',
                    })
                  : '—'}
              </p>
              {purchase.motivo_anulacion && (
                <p className="text-xs text-on-surface-variant mt-1">
                  <span className="font-bold">Motivo:</span> {purchase.motivo_anulacion}
                </p>
              )}
            </div>
          )}

          {/* Tabla de Ítems */}
          <div className="space-y-3">
            <h4 className="text-xs font-black uppercase tracking-widest text-on-surface-variant">
              Ítems Comprados
            </h4>
            <div className="rounded-2xl border border-outline-variant/10 overflow-hidden bg-white">
              {loading ? (
                <div className="py-12 flex flex-col items-center justify-center space-y-2 text-primary/40">
                  <div className="w-8 h-8 border-4 border-primary/10 border-t-primary rounded-full animate-spin"></div>
                  <p className="text-[10px] font-black uppercase tracking-widest">Cargando ítems...</p>
                </div>
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-surface-container-low/50 border-b border-outline-variant/10">
                      <th className="px-5 py-3 text-[10px] font-black text-on-surface-variant uppercase tracking-widest">
                        Insumo
                      </th>
                      <th className="px-4 py-3 text-[10px] font-black text-on-surface-variant uppercase tracking-widest text-right">
                        Cantidad
                      </th>
                      <th className="px-4 py-3 text-[10px] font-black text-on-surface-variant uppercase tracking-widest text-right">
                        Costo Unitario
                      </th>
                      <th className="px-5 py-3 text-[10px] font-black text-on-surface-variant uppercase tracking-widest text-right">
                        Subtotal
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/5">
                    {items.map((it) => {
                      const unidadUsada = it.en_unidad_compra
                        ? it.unidad_compra_nombre || it.unidad_stock_nombre
                        : it.unidad_stock_nombre;
                      const factor = Number(it.factor_compra || 1);
                      const tieneFactor = it.en_unidad_compra && factor !== 1;

                      return (
                        <tr key={it.id} className="hover:bg-surface-container-high/40 transition-colors">
                          <td className="px-5 py-3.5">
                            <p className="text-xs font-headline font-extrabold text-on-surface">
                              {it.insumo_nombre}
                            </p>
                            {tieneFactor && (
                              <p className="text-[10px] font-bold text-outline mt-0.5">
                                ={' '}
                                {Number(it.cantidad_stock).toLocaleString('es-AR', {
                                  maximumFractionDigits: 3,
                                })}{' '}
                                {it.unidad_stock_nombre} en stock
                              </p>
                            )}
                          </td>
                          <td className="px-4 py-3.5 text-right text-xs font-bold text-on-surface whitespace-nowrap">
                            {Number(it.cantidad).toLocaleString('es-AR', {
                              maximumFractionDigits: 3,
                            })}{' '}
                            <span className="text-[10px] text-outline">{unidadUsada}</span>
                          </td>
                          <td className="px-4 py-3.5 text-right text-xs font-bold text-on-surface whitespace-nowrap">
                            $
                            {Number(it.costo_unitario).toLocaleString('es-AR', {
                              minimumFractionDigits: 2,
                            })}{' '}
                            <span className="text-[10px] text-outline">/ {unidadUsada}</span>
                          </td>
                          <td className="px-5 py-3.5 text-right text-xs font-black text-primary whitespace-nowrap">
                            $
                            {Number(it.subtotal).toLocaleString('es-AR', {
                              minimumFractionDigits: 2,
                            })}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-surface-container-low/30 border-t border-outline-variant/10">
                      <td colSpan={3} className="px-5 py-3 text-right text-xs font-black text-on-surface uppercase tracking-wider">
                        Total General
                      </td>
                      <td className="px-5 py-3 text-right text-sm font-black text-primary">
                        ${Number(purchase.total).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>
          </div>

          {/* Sección de Anulación */}
          {!isAnulada && (
            <div className="pt-2">
              {!showAnularConfirm ? (
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => setShowAnularConfirm(true)}
                    className="px-5 py-3 bg-error/10 text-error hover:bg-error hover:text-white font-bold rounded-2xl text-xs uppercase tracking-widest transition-all active:scale-95 flex items-center gap-2"
                  >
                    <span className="material-symbols-outlined text-base">block</span>
                    Anular Compra
                  </button>
                </div>
              ) : (
                <div className="p-6 bg-error/5 border border-error/20 rounded-[2rem] space-y-4 animate-in fade-in zoom-in-95 duration-300">
                  <div className="flex items-center gap-2 text-error">
                    <span className="material-symbols-outlined text-xl">warning</span>
                    <h4 className="text-sm font-headline font-extrabold uppercase tracking-tight">
                      Confirmar Anulación de Compra
                    </h4>
                  </div>

                  <p className="text-xs font-bold text-on-surface">
                    Se va a descontar del stock lo que se compró y se va a revertir la deuda con el proveedor.
                    {purchase.condicion_pago === 'contado' && (
                      <span className="block mt-1 text-on-surface-variant font-medium">
                        Como ya se pagó, el pago queda como saldo a favor con el proveedor (no se devuelve a la caja: registrá el reintegro cuando el proveedor te devuelva el dinero).
                      </span>
                    )}
                  </p>

                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-error uppercase tracking-widest ml-1">
                      Motivo de Anulación <span className="text-error">*</span>
                    </label>
                    <textarea
                      rows={2}
                      value={motivoAnulacion}
                      onChange={(e) => setMotivoAnulacion(e.target.value)}
                      placeholder="Ej: Factura anulada por proveedor, mercadería devuelta, error de carga..."
                      className="w-full bg-white border border-error/20 rounded-2xl py-3 px-4 text-xs font-bold text-on-surface focus:ring-2 focus:ring-error/20 resize-none shadow-sm"
                    />
                  </div>

                  <div className="flex gap-3 pt-1">
                    <button
                      type="button"
                      disabled={anulando}
                      onClick={() => {
                        setShowAnularConfirm(false);
                        setMotivoAnulacion('');
                      }}
                      className="flex-1 py-3 bg-white text-on-surface-variant font-bold rounded-xl hover:bg-slate-100 transition-all border border-outline-variant/20 text-[10px] uppercase tracking-widest active:scale-95"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      disabled={anulando || !motivoAnulacion.trim()}
                      onClick={handleAnularCompra}
                      className="flex-[2] py-3 bg-error text-white font-bold rounded-xl shadow-lg shadow-error/20 hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-2 text-[10px] uppercase tracking-widest disabled:opacity-50"
                    >
                      {anulando ? (
                        <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                      ) : (
                        <>
                          <span className="material-symbols-outlined text-sm">check</span>
                          <span>Confirmar Anulación</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-10 py-6 bg-surface-container-low/50 border-t border-outline-variant/10 flex justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-8 py-3.5 bg-white text-on-surface-variant font-bold rounded-2xl hover:bg-slate-100 transition-all border border-outline-variant/20 active:scale-95 text-xs uppercase tracking-widest"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};

export default PurchaseDetailModal;
