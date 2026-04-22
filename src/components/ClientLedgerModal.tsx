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
  const [fullClient, setFullClient] = useState<any>(null);
  const [totals, setTotals] = useState({ debe: 0, haber: 0, saldo: 0 });

  const fetchLedgerData = useCallback(async () => {
    setLoading(true);
    try {
      // 0. Fetch Full Client Details
      const { data: clientData } = await supabase
        .from('t_clientes')
        .select('*')
        .eq('id', client.id)
        .single();
      setFullClient(clientData);

      // 1. Fetch Vouchers (Debe)
      const { data: vouchers, error: vError } = await supabase
        .from('t_comprobantes')
        .select('*')
        .eq('cliente_id', client.id);
      
      if (vError) throw vError;

      // 2. Fetch Receipts (Haber)
      const { data: receipts, error: rError } = await supabase
        .from('t_recibos')
        .select('*')
        .eq('cliente_id', client.id);
      
      if (rError) throw rError;

      // 3. Fetch specific voucher payments (including seña)
      const { data: payments, error: pError } = await supabase
        .from('t_comprobante_cobros')
        .select('*, t_comprobantes!inner(cliente_id)')
        .eq('t_comprobantes.cliente_id', client.id);
      
      if (pError) throw pError;

      // Combine and Transform
      let items: any[] = [];

      // Add Vouchers
      vouchers?.forEach(v => {
        items.push({
          id: v.id,
          fecha: v.fecha,
          tipo: v.tipo,
          numero: v.numero,
          descripcion: v.observaciones || 'Voucher emitido',
          debe: Number(v.total),
          haber: 0
        });
      });

      // Add Receipts
      receipts?.forEach(r => {
        items.push({
          id: r.id,
          fecha: r.fecha,
          tipo: 'RECIBO',
          numero: r.numero,
          descripcion: r.observaciones || 'Pago recibido',
          debe: 0,
          haber: Number(r.total)
        });
      });

      // Add independent payments (only if they aren't already represented in receipts - but in this schema they seem separate)
      // Actually seña and payments tied to job billing flow are here.
      payments?.forEach(p => {
        items.push({
          id: p.id,
          fecha: p.fecha || p.created_at || new Date().toISOString(), // Fallback
          tipo: 'PAGO-EXT',
          numero: '---',
          descripcion: p.observaciones || 'Pago parcial / Seña',
          debe: 0,
          haber: Number(p.importe)
        });
      });

      // Sort by date
      items.sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());

      // Calculate running balance and totals
      let currentSaldo = 0;
      let totalDebe = 0;
      let totalHaber = 0;

      const finalLedger: LedgerItem[] = items.map(item => {
        currentSaldo += (item.debe - item.haber);
        totalDebe += item.debe;
        totalHaber += item.haber;
        return { ...item, saldo: currentSaldo };
      });

      setLedger(finalLedger.reverse()); // Show newest first
      setTotals({ debe: totalDebe, haber: totalHaber, saldo: currentSaldo });
    } catch (err: any) {
      toast.error('Error al cargar cuenta corriente: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [client.id]);

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
        <div className="grid grid-cols-3 divide-x divide-outline-variant/10 bg-white border-b border-outline-variant/5">
           <div className="px-10 py-6">
              <p className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest mb-1 opacity-50">Total Owed (Debe)</p>
              <p className="text-xl font-black text-on-surface">${totals.debe.toLocaleString('es-AR')}</p>
           </div>
           <div className="px-10 py-6">
              <p className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest mb-1 opacity-50">Total Paid (Haber)</p>
              <p className="text-xl font-black text-emerald-600">${totals.haber.toLocaleString('es-AR')}</p>
           </div>
           <div className="px-10 py-6 bg-slate-50/50">
              <p className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest mb-1 opacity-50">State</p>
              <p className={`text-xl font-black ${totals.saldo > 0 ? 'text-error' : 'text-emerald-600'}`}>
                {totals.saldo > 0 ? 'DEUDOR' : totals.saldo < 0 ? 'A FAVOR' : 'EQUILIBRADO'}
              </p>
           </div>
        </div>

        {/* Ledger Table */}
        <div className="flex-1 overflow-y-auto no-scrollbar p-10 bg-slate-50/20">
          {loading ? (
            <div className="h-full flex flex-col items-center justify-center space-y-4">
              <div className="w-12 h-12 border-4 border-primary/10 border-t-primary rounded-full animate-spin"></div>
              <p className="text-xs font-black uppercase tracking-widest text-outline">Conciliando cuentas...</p>
            </div>
          ) : (
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
                  <tr key={idx} className="group animate-in fade-in slide-in-from-right-4 duration-300" style={{ animationDelay: `${idx * 20}ms` }}>
                    <td className="bg-white px-6 py-5 rounded-l-3xl border-y border-l border-outline-variant/10 first-letter:uppercase">
                      <p className="text-sm font-bold text-on-surface">{new Date(item.fecha).toLocaleDateString('es-AR')}</p>
                      <p className="text-[9px] text-outline font-bold uppercase tracking-tight">{item.tipo}</p>
                    </td>
                    <td className="bg-white px-6 py-5 border-y border-outline-variant/10">
                      <p className="text-sm font-bold text-on-surface">{item.numero}</p>
                      <p className="text-[10px] text-on-surface-variant line-clamp-1">{item.descripcion}</p>
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
