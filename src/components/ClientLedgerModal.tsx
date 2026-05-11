import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { toast } from 'react-hot-toast';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

interface LedgerItem {
  id: string;
  fecha: string;
  tipo: string;
  numero: string;
  descripcion: string;
  debe: number;
  haber: number;
  saldo: number;
}

interface ClientLedgerModalProps {
  client: {
    id: string;
    razon_social: string;
  };
  onClose: () => void;
}

const ClientLedgerModal: React.FC<ClientLedgerModalProps> = ({ client, onClose }) => {
  const [loading, setLoading] = useState(true);
  const [ledger, setLedger] = useState<LedgerItem[]>([]);
  const [pendingJobs, setPendingJobs] = useState<any[]>([]);
  const [fullClient, setFullClient] = useState<any>(null);
  const [totals, setTotals] = useState({ debe: 0, haber: 0, saldo: 0, disponible_cc: 0 });
  const [activeTab, setActiveTab] = useState<'historial' | 'deudas'>('historial');

  const fetchLedgerData = useCallback(async () => {
    setLoading(true);
    try {
      // 0. Fetch Consolidated Client Balance
      const { data: clientFinData } = await supabase
        .from('v_saldo_clientes')
        .select('*')
        .eq('id', client.id)
        .single();
      setFullClient(clientFinData);

      // 1. Fetch Pending Jobs for FIFO
      const { data: pJobs } = await supabase
        .from('v_saldo_trabajos')
        .select('*')
        .eq('cliente_id', client.id)
        .gt('saldo_pendiente', 0)
        .order('fecha_aprobacion', { ascending: true });
      setPendingJobs(pJobs || []);

      // 2. Fetch History Items
      // We'll construct a ledger from Receipts, Applications, and Direct Payments
      const [{ data: receipts }, { data: directPayments }, { data: applications }] = await Promise.all([
        supabase.from('t_recibos').select('*').eq('cliente_id', client.id),
        supabase.from('t_pagos_trabajo').select('*, t_trabajos(descripcion)').eq('cliente_id', client.id),
        supabase.from('t_recibo_trabajos').select('*, t_trabajos(descripcion), t_recibos(numero)').eq('cliente_id', client.id)
      ]);

      let items: any[] = [];

      // Add Receipts (Haber)
      receipts?.forEach(r => {
        items.push({
          id: r.id,
          fecha: r.fecha,
          tipo: 'RECIBO CC',
          numero: r.numero,
          descripcion: r.observaciones || 'Entrega a cuenta corriente',
          debe: 0,
          haber: Number(r.total)
        });
      });

      // Add Direct Payments (Haber)
      directPayments?.forEach(p => {
        items.push({
          id: p.id,
          fecha: p.fecha,
          tipo: 'PAGO DIR',
          numero: '---',
          descripcion: `Pago directo a ${p.t_trabajos?.descripcion || 'Trabajo'}`,
          debe: 0,
          haber: Number(p.importe)
        });
      });

      // Add Applications (Informative)
      applications?.forEach(a => {
        items.push({
          id: a.id,
          fecha: a.created_at,
          tipo: 'APLICACIÓN',
          numero: `R:${a.t_recibos?.numero || '---'}`,
          descripcion: `Aplicado a ${a.t_trabajos?.descripcion || 'Trabajo'}`,
          debe: 0,
          haber: 0, // Balance neutral as it's an internal movement
          is_application: true,
          amount: a.importe
        });
      });

      // Fetch Vouchers if any (Debe)
      const { data: vouchers } = await supabase.from('t_comprobantes').select('*').eq('cliente_id', client.id);
      vouchers?.forEach(v => {
        items.push({
          id: v.id,
          fecha: v.fecha,
          tipo: v.tipo,
          numero: v.numero,
          descripcion: v.observaciones || 'Factura / Nota de Débito',
          debe: Number(v.total),
          haber: 0
        });
      });

      // Add Jobs as Debt (Debe) - For the ledger, a job generates debt on approval
      const { data: approvedJobs } = await supabase.from('t_trabajos').select('*').eq('cliente_id', client.id).not('fecha_aprobacion', 'is', null);
      approvedJobs?.forEach(j => {
        items.push({
          id: j.id,
          fecha: j.fecha_aprobacion,
          tipo: 'TRABAJO',
          numero: j.id.slice(0,8),
          descripcion: j.descripcion,
          debe: Number(j.total),
          haber: 0
        });
      });

      // Sort and calculate
      items.sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());

      let currentSaldo = 0;
      let totalDebe = 0;
      let totalHaber = 0;

      const finalLedger: LedgerItem[] = items.map(item => {
        if (!item.is_application) {
          currentSaldo += (item.debe - item.haber);
          totalDebe += item.debe;
          totalHaber += item.haber;
        }
        return { ...item, saldo: currentSaldo };
      });

      setLedger(finalLedger.reverse());
      setTotals({ 
        debe: totalDebe, 
        haber: totalHaber, 
        saldo: clientFinData?.saldo_total || currentSaldo,
        disponible_cc: clientFinData?.saldo_disponible_cc || 0
      });

    } catch (err: any) {
      toast.error('Error al cargar datos: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [client.id]);

  const applyFIFOPayments = async () => {
    if (totals.disponible_cc <= 0) {
      toast.error('No hay saldo disponible en cuenta corriente para aplicar');
      return;
    }
    if (pendingJobs.length === 0) {
      toast.error('No hay trabajos con saldo pendiente para este cliente');
      return;
    }

    setLoading(true);
    try {
      // 1. Get all unused receipts (haber_disponible > 0)
      const { data: receipts } = await supabase
        .from('t_recibos')
        .select('id, numero, total')
        .eq('cliente_id', client.id)
        .order('fecha', { ascending: true });

      if (!receipts) return;

      // Calculate used amount per receipt from applications
      const { data: apps } = await supabase.from('t_recibo_trabajos').select('recibo_id, importe');
      const usedByReceipt = (apps || []).reduce((acc: any, curr) => {
        acc[curr.recibo_id] = (acc[curr.recibo_id] || 0) + Number(curr.importe);
        return acc;
      }, {});

      let availableReceipts = receipts.map(r => ({
        ...r,
        disponible: Number(r.total) - (usedByReceipt[r.id] || 0)
      })).filter(r => r.disponible > 0);

      let jobsToPay = [...pendingJobs];
      const newApplications = [];

      for (const receipt of availableReceipts) {
        let rDisp = receipt.disponible;
        for (const job of jobsToPay) {
          if (rDisp <= 0) break;
          if (job.saldo_pendiente <= 0) continue;

          const amountToApply = Math.min(rDisp, job.saldo_pendiente);
          newApplications.push({
            recibo_id: receipt.id,
            trabajo_id: job.id,
            cliente_id: client.id,
            importe: amountToApply
          });

          rDisp -= amountToApply;
          job.saldo_pendiente -= amountToApply;
        }
        if (newApplications.length >= 50) break; // Batch limit safety
      }

      if (newApplications.length === 0) {
        toast('Nada nuevo que aplicar');
        return;
      }

      const { error } = await supabase.from('t_recibo_trabajos').insert(newApplications);
      if (error) throw error;

      toast.success(`Se aplicaron ${newApplications.length} pagos correctamente (FIFO)`);
      fetchLedgerData();
    } catch (err: any) {
      toast.error('Error al aplicar FIFO: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLedgerData();
  }, [fetchLedgerData]);

  const generatePDF = () => {
    if (!ledger.length) return;
    
    const doc = new jsPDF();
    
    // --- Header (Same as Jobs) ---
    doc.setFillColor(30, 41, 59); // Slate-800
    doc.rect(0, 0, 210, 40, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(24);
    doc.text('GRAFIKO', 15, 20);
    doc.setFontSize(10);
    doc.text('Sistema de Gestión de Imprenta', 15, 30);
    
    doc.setFontSize(14);
    doc.text('CARTOLA DE CUENTA CORRIENTE', 120, 20);
    doc.setFontSize(10);
    doc.text(`Fecha Emisión: ${new Date().toLocaleDateString('es-AR')}`, 120, 30);
    
    // --- Client Information ---
    doc.setTextColor(30, 41, 59);
    doc.setFontSize(11);
    doc.text('DATOS DEL CLIENTE', 15, 55);
    doc.line(15, 57, 100, 57);
    
    doc.setFontSize(10);
    doc.text(`Razón Social: ${fullClient?.razon_social || client.razon_social}`, 15, 65);
    doc.text(`CUIT: ${fullClient?.cuit || 'N/A'}`, 15, 72);
    doc.text(`IVA: ${fullClient?.situacion_iva || 'N/A'}`, 15, 79);
    doc.text(`Email: ${fullClient?.email || 'N/A'}`, 15, 86);

    // --- Summary Totals ---
    doc.setFontSize(11);
    doc.text('RESUMEN DE SALDOS', 120, 55);
    doc.line(120, 57, 195, 57);
    
    doc.setFontSize(10);
    doc.text(`Total Owed (Debe): $${totals.debe.toLocaleString('es-AR')}`, 120, 65);
    doc.text(`Total Paid (Haber): $${totals.haber.toLocaleString('es-AR')}`, 120, 72);
    
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(`SALDO ACTUAL: $${totals.saldo.toLocaleString('es-AR')}`, 120, 85);
    doc.setFont('helvetica', 'normal');

    // --- Ledger Table ---
    // Note: Use a copy and sort for PDF (Oldest first for chronological order in PDF looks better)
    const tableData = [...ledger].reverse().map(item => [
      new Date(item.fecha).toLocaleDateString('es-AR'),
      `${item.tipo}${item.numero !== '---' ? ` [${item.numero}]` : ''}`,
      item.descripcion,
      item.debe > 0 ? `$${item.debe.toLocaleString('es-AR')}` : '',
      item.haber > 0 ? `$${item.haber.toLocaleString('es-AR')}` : '',
      `$${item.saldo.toLocaleString('es-AR')}`
    ]);

    autoTable(doc, {
      startY: 100,
      head: [['Fecha', 'Comprobante', 'Detalle', 'Debe', 'Haber', 'Saldo Acum.']],
      body: tableData,
      headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: 'bold' },
      styles: { fontSize: 8, cellPadding: 3 },
      columnStyles: {
        3: { halign: 'right' },
        4: { halign: 'right' },
        5: { halign: 'right', fontStyle: 'bold' }
      }
    });

    const finalY = (doc as any).lastAutoTable.finalY + 10;
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text('Cálculo en tiempo real según facturación y cobros registrados en sistema.', 15, finalY);

    doc.save(`CuentaCorriente_${fullClient?.razon_social || 'cliente'}.pdf`);
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300">
      <div className="bg-white w-full max-w-5xl h-[85vh] rounded-[3rem] shadow-2xl border border-white/20 flex flex-col overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-12 duration-500">
        {/* Header */}
        <div className="px-10 py-8 border-b border-outline-variant/10 flex justify-between items-center bg-slate-50">
          <div>
            <div className="flex items-center gap-3">
               <h3 className="text-3xl font-headline font-extrabold text-on-surface tracking-tight">Cuenta Corriente</h3>
               <span className="px-3 py-1 bg-primary/10 text-primary rounded-full text-[10px] font-black uppercase tracking-widest leading-none">Historial Completo</span>
            </div>
            <p className="text-xs text-on-surface-variant font-bold uppercase tracking-widest mt-1">Socio: <span className="text-primary">{client.razon_social}</span></p>
          </div>
          <div className="flex items-center gap-6">
             <div className="text-right">
                <p className="text-[10px] font-black text-outline uppercase tracking-widest leading-none mb-1">Saldo Actual</p>
                <p className={`text-2xl font-black ${totals.saldo > 0 ? 'text-error' : totals.saldo < 0 ? 'text-emerald-600' : 'text-on-surface'}`}>
                  ${totals.saldo.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                </p>
             </div>
             <button onClick={onClose} className="p-3 hover:bg-error/10 text-on-surface-variant hover:text-error rounded-2xl transition-all">
               <span className="material-symbols-outlined text-3xl">close</span>
             </button>
          </div>
        </div>

        {/* Totals Summary Bar */}
        <div className="grid grid-cols-4 divide-x divide-outline-variant/10 bg-white border-b border-outline-variant/5">
           <div className="px-10 py-6">
              <p className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest mb-1 opacity-50">Deuda por Trabajos</p>
              <p className="text-xl font-black text-on-surface">${Number(fullClient?.saldo_trabajos || 0).toLocaleString('es-AR')}</p>
           </div>
           <div className="px-10 py-6 bg-indigo-50/30">
              <p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest mb-1">Disponible en CC</p>
              <p className="text-xl font-black text-indigo-700">${Number(fullClient?.saldo_disponible_cc || 0).toLocaleString('es-AR')}</p>
           </div>
           <div className="px-10 py-6">
              <p className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest mb-1 opacity-50">Saldo Consolidado</p>
              <p className={`text-xl font-black ${totals.saldo > 0 ? 'text-error' : 'text-emerald-600'}`}>
                ${Math.abs(totals.saldo).toLocaleString('es-AR')}
                <span className="text-[10px] ml-1 uppercase">{totals.saldo > 0 ? 'Deudor' : 'A Favor'}</span>
              </p>
           </div>
           <div className="px-8 py-6 flex items-center justify-center bg-slate-50">
              <button 
                onClick={applyFIFOPayments}
                disabled={loading || totals.disponible_cc <= 0 || pendingJobs.length === 0}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-slate-900/10 hover:bg-primary transition-all active:scale-95 disabled:opacity-30 disabled:grayscale"
              >
                <span className="material-symbols-outlined text-lg">auto_fix_high</span>
                Aplicar FIFO
              </button>
           </div>
        </div>

        {/* Tabs */}
        <div className="flex px-10 bg-white border-b border-outline-variant/5">
           <button 
             onClick={() => setActiveTab('historial')}
             className={`px-8 py-4 text-[10px] font-black uppercase tracking-[0.2em] transition-all border-b-2 ${activeTab === 'historial' ? 'border-primary text-primary' : 'border-transparent text-outline'}`}
           >
             Movimientos
           </button>
           <button 
             onClick={() => setActiveTab('deudas')}
             className={`px-8 py-4 text-[10px] font-black uppercase tracking-[0.2em] transition-all border-b-2 ${activeTab === 'deudas' ? 'border-primary text-primary' : 'border-transparent text-outline'}`}
           >
             Trabajos Pendientes ({pendingJobs.length})
           </button>
        </div>

        {/* Ledger Table / Pending Jobs */}
        <div className="flex-1 overflow-y-auto no-scrollbar p-10 bg-slate-50/20">
          {loading ? (
            <div className="h-full flex flex-col items-center justify-center space-y-4">
              <div className="w-12 h-12 border-4 border-primary/10 border-t-primary rounded-full animate-spin"></div>
              <p className="text-xs font-black uppercase tracking-widest text-outline">Procesando finanzas...</p>
            </div>
          ) : activeTab === 'historial' ? (
            <table className="w-full text-left border-separate border-spacing-y-3">
              <thead>
                <tr>
                  <th className="px-6 py-2 text-[10px] font-black text-on-surface-variant uppercase tracking-widest">Fecha</th>
                  <th className="px-6 py-2 text-[10px] font-black text-on-surface-variant uppercase tracking-widest">Comprobante / Detalle</th>
                  <th className="px-6 py-2 text-[10px] font-black text-on-surface-variant uppercase tracking-widest text-right">Debe</th>
                  <th className="px-6 py-2 text-[10px] font-black text-on-surface-variant uppercase tracking-widest text-right">Haber</th>
                  <th className="px-6 py-2 text-[10px] font-black text-on-surface-variant uppercase tracking-widest text-right">Saldo Acum.</th>
                </tr>
              </thead>
              <tbody>
                {ledger.map((item, idx) => (
                  <tr key={idx} className={`group animate-in fade-in slide-in-from-right-4 duration-300 ${(item as any).is_application ? 'opacity-60 grayscale-[0.5]' : ''}`} style={{ animationDelay: `${idx * 20}ms` }}>
                    <td className="bg-white px-6 py-5 rounded-l-3xl border-y border-l border-outline-variant/10 first-letter:uppercase">
                      <p className="text-sm font-bold text-on-surface">{new Date(item.fecha).toLocaleDateString('es-AR')}</p>
                      <p className="text-[9px] text-outline font-bold uppercase tracking-tight">{item.tipo}</p>
                    </td>
                    <td className="bg-white px-6 py-5 border-y border-outline-variant/10">
                      <p className="text-sm font-bold text-on-surface">{(item as any).is_application ? (item as any).numero : item.numero}</p>
                      <p className="text-[10px] text-on-surface-variant line-clamp-1">{item.descripcion}</p>
                      {(item as any).is_application && (
                         <span className="text-[9px] font-black text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">Importe: ${(item as any).amount.toLocaleString('es-AR')}</span>
                      )}
                    </td>
                    <td className="bg-white px-6 py-5 border-y border-outline-variant/10 text-right">
                       {item.debe > 0 && <span className="text-sm font-black text-on-surface">${item.debe.toLocaleString('es-AR')}</span>}
                    </td>
                    <td className="bg-white px-6 py-5 border-y border-outline-variant/10 text-right">
                       {item.haber > 0 && <span className="text-sm font-black text-emerald-600">${item.haber.toLocaleString('es-AR')}</span>}
                    </td>
                    <td className="bg-white px-6 py-5 rounded-r-3xl border-y border-r border-outline-variant/10 text-right">
                       <span className={`text-sm font-black ${item.saldo > 0 ? 'text-error' : item.saldo < 0 ? 'text-emerald-600' : 'text-on-surface'}`}>
                         ${item.saldo.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                       </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            /* Pending Jobs List */
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {pendingJobs.map((job) => (
                <div key={job.id} className="bg-white p-6 rounded-3xl border border-outline-variant/10 shadow-sm hover:border-primary/20 transition-all group">
                   <div className="flex justify-between items-start mb-4">
                      <div>
                        <p className="text-[9px] font-black text-outline uppercase tracking-widest mb-1">Trabajo #{job.id.slice(0,8)}</p>
                        <h4 className="text-sm font-black text-on-surface group-hover:text-primary transition-colors">{job.descripcion}</h4>
                      </div>
                      <span className="px-2 py-1 bg-surface-container-low text-[9px] font-black uppercase rounded text-on-surface-variant">{job.estado}</span>
                   </div>
                   <div className="grid grid-cols-2 gap-4 pt-4 border-t border-outline-variant/5">
                      <div>
                        <p className="text-[8px] font-black text-outline uppercase tracking-widest mb-0.5">Total</p>
                        <p className="text-sm font-bold text-on-surface">${job.total.toLocaleString('es-AR')}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[8px] font-black text-error uppercase tracking-widest mb-0.5">Saldo Pendiente</p>
                        <p className="text-sm font-black text-error">${job.saldo_pendiente.toLocaleString('es-AR')}</p>
                      </div>
                   </div>
                   <div className="mt-4 flex items-center justify-between text-[9px] font-bold text-outline uppercase tracking-tighter">
                      <span>Aprobado: {job.fecha_aprobacion ? new Date(job.fecha_aprobacion).toLocaleDateString('es-AR') : '---'}</span>
                      <div className="flex gap-1">
                        {job.total_cobrado_directo > 0 && <span className="text-emerald-600">Cobrado: ${job.total_cobrado_directo.toLocaleString('es-AR')}</span>}
                      </div>
                   </div>
                </div>
              ))}
            </div>
          )}
          
          {!loading && ledger.length === 0 && (
            <div className="h-64 flex flex-col items-center justify-center text-outline/30 space-y-4">
               <span className="material-symbols-outlined text-6xl">account_balance_wallet</span>
               <p className="text-[10px] font-black uppercase tracking-widest">Sin movimientos registrados</p>
            </div>
          )}
        </div>
        
        {/* Footer info */}
        <div className="px-10 py-6 bg-white border-t border-outline-variant/10 flex justify-between items-center">
           <p className="text-[9px] font-bold text-outline uppercase tracking-[0.2em]">Cálculo en tiempo real según facturación y cobros registrados</p>
           <div className="flex gap-4">
              <button 
                onClick={generatePDF}
                disabled={loading || ledger.length === 0}
                className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 text-white rounded-2xl text-xs font-bold shadow-lg shadow-emerald-500/20 hover:brightness-110 active:scale-95 transition-all"
              >
                 <span className="material-symbols-outlined text-lg">downloading</span>
                 Descargar PDF
              </button>
           </div>
        </div>
      </div>
    </div>
  );
};

export default ClientLedgerModal;
