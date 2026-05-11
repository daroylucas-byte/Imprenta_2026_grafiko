import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { toast } from 'react-hot-toast';
import { useForm } from 'react-hook-form';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

interface BillingModalProps {
  job?: any;
  existingInvoiceId?: string;
  onClose: () => void;
  onSuccess: () => void;
}

const BillingModal: React.FC<BillingModalProps> = ({ job, existingInvoiceId, onClose, onSuccess }) => {
  const baseTotal = Number(job?.total || 0);
  const initialSubtotal = parseFloat((baseTotal / 1.21).toFixed(2));
  const initialIva = parseFloat((baseTotal - initialSubtotal).toFixed(2));

  const { register, handleSubmit, setValue, watch, reset, formState: { errors } } = useForm({
    defaultValues: {
      cliente_id: job?.cliente_id || '',
      tipo: 'Factura B',
      fecha: new Date().toISOString().split('T')[0],
      numero: '',
      subtotal: initialSubtotal,
      iva: initialIva,
      total: baseTotal,
      estado: 'pendiente',
      observaciones: job ? `Facturación de trabajo: ${job.descripcion}` : '',
    }
  });

  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [jobDetails, setJobDetails] = useState<any>(null);
  const [jobBalance, setJobBalance] = useState<any>(null);
  const [clientName, setClientName] = useState('');
  
  const subtotal = watch('subtotal');
  const iva = watch('iva');

  // Fetch full job details for PDF
  useEffect(() => {
    if (job?.id) {
      const fetchJobDetails = async () => {
        try {
          const { data, error } = await supabase
            .from('t_trabajos')
            .select(`
              *,
              t_clientes (*),
              t_conf_soportes (nombre),
              t_conf_sistemas_impresion (nombre),
              t_conf_tamanios_papel (nombre),
              t_conf_peliculados (nombre),
              t_conf_acabados (nombre),
              t_conf_terminaciones (nombre),
              t_conf_tipos_entrega (nombre),
              t_trabajo_productos (
                *,
                t_productos (*)
              )
            `)
            .eq('id', job.id)
            .single();

          if (error) throw error;
          setJobDetails(data);
          setClientName(data.t_clientes?.razon_social || '');

          // Fetch financial balance for PDF totals
          const { data: balance } = await supabase
            .from('v_saldo_trabajos')
            .select('*')
            .eq('id', job.id)
            .single();
          setJobBalance(balance);

        } catch (err: any) {
          console.error('Error fetching full job details:', err);
        }
      };
      fetchJobDetails();
    }
  }, [job?.id]);

  // Fetch existing invoice data if in edit mode
  useEffect(() => {
    if (existingInvoiceId) {
      const fetchInvoice = async () => {
        setFetching(true);
        try {
          const { data, error } = await supabase
            .from('t_comprobantes')
            .select('*, t_clientes(razon_social)')
            .eq('id', existingInvoiceId)
            .single();

          if (error) throw error;
          if (data) {
            setClientName(data.t_clientes?.razon_social || '');
            reset({
              cliente_id: data.cliente_id,
              tipo: data.tipo,
              fecha: data.fecha,
              numero: data.numero,
              subtotal: Number(data.subtotal),
              iva: Number(data.iva),
              total: Number(data.total),
              estado: data.estado || 'pendiente',
              observaciones: data.observaciones,
            });
          }
        } catch (err: any) {
          toast.error('Error al cargar factura existente: ' + err.message);
        } finally {
          setFetching(false);
        }
      };
      fetchInvoice();
    }
  }, [existingInvoiceId, reset]);

  // Recalculate total when subtotal or iva changes
  useEffect(() => {
    const total = Number(subtotal) + Number(iva);
    setValue('total', Number(total.toFixed(2)));
  }, [subtotal, iva, setValue]);

  const generatePDF = (invoiceData: any) => {
    if (!jobDetails) return;
    
    const doc = new jsPDF();
    const client = jobDetails.t_clientes;
    
    // --- Header ---
    doc.setFillColor(30, 41, 59); // Slate-800
    doc.rect(0, 0, 210, 40, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(24);
    doc.text('GRAFIKO', 15, 20);
    doc.setFontSize(10);
    doc.text('Sistema de Gestión de Imprenta', 15, 30);
    
    doc.setFontSize(14);
    doc.text(invoiceData.tipo.toUpperCase(), 140, 15);
    doc.setFontSize(10);
    doc.text(`N°: ${invoiceData.numero}`, 140, 22);
    doc.text(`Fecha: ${invoiceData.fecha}`, 140, 29);
    
    // --- Client Information ---
    doc.setTextColor(30, 41, 59);
    doc.setFontSize(11);
    doc.text('DATOS DEL CLIENTE', 15, 55);
    doc.line(15, 57, 100, 57);
    
    doc.setFontSize(10);
    doc.text(`Razón Social: ${client?.razon_social || 'N/A'}`, 15, 65);
    doc.text(`CUIT: ${client?.cuit || 'N/A'}`, 15, 72);
    doc.text(`IVA: ${client?.situacion_iva || 'N/A'}`, 15, 79);
    doc.text(`Dirección: ${client?.direccion || 'N/A'}, ${client?.localidad || ''}`, 15, 86);

    // --- Job General Information ---
    doc.setFontSize(11);
    doc.text('DETALLE DEL TRABAJO', 120, 55);
    doc.line(120, 57, 195, 57);
    
    doc.setFontSize(9);
    doc.text(`Descripción: ${jobDetails.descripcion}`, 120, 65, { maxWidth: 75 });
    doc.text(`Soporte: ${jobDetails.t_conf_soportes?.nombre || 'N/A'}`, 120, 75);
    doc.text(`Imprenta: ${jobDetails.t_conf_sistemas_impresion?.nombre || 'N/A'}`, 120, 82);
    doc.text(`Entrega: ${jobDetails.t_conf_tipos_entrega?.nombre || 'N/A'}`, 120, 89);

    // --- Items Table ---
    const tableData = jobDetails.t_trabajo_productos.map((item: any) => [
      item.t_productos?.nombre || 'Producto',
      item.cantidad,
      `$${Number(item.precio_unitario).toLocaleString('es-AR')}`,
      `$${Number(item.subtotal).toLocaleString('es-AR')}`,
      `${item.numeracion_desde ? `N° ${item.numeracion_desde}-${item.numeracion_hasta}` : ''} ${item.fecha_muestra ? `| Muestra: ${item.fecha_muestra}` : ''}`
    ]);

    autoTable(doc, {
      startY: 100,
      head: [['Producto', 'Cant.', 'Precio Unit.', 'Subtotal', 'Config. Producción']],
      body: tableData,
      headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: 'bold' },
      styles: { fontSize: 8, cellPadding: 4 },
      columnStyles: {
        1: { halign: 'center' },
        2: { halign: 'right' },
        3: { halign: 'right' },
        4: { fontSize: 7, textColor: [100, 100, 100] }
      }
    });

    // --- Totals ---
    const finalY = (doc as any).lastAutoTable.finalY + 10;
    
    doc.setFontSize(10);
    doc.text(`Subtotal: $${invoiceData.subtotal.toLocaleString('es-AR')}`, 140, finalY);
    doc.text(`IVA (21%): $${invoiceData.iva.toLocaleString('es-AR')}`, 140, finalY + 7);
    
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(`TOTAL FINAL: $${invoiceData.total.toLocaleString('es-AR')}`, 140, finalY + 16);
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    const totalPagado = Number(jobBalance?.total_pagado_directo || 0) + Number(jobBalance?.total_aplicado_cc || 0);
    if (totalPagado > 0) {
      doc.text(`Total Pagado: $${totalPagado.toLocaleString('es-AR')}`, 140, finalY + 25);
      doc.setTextColor(30, 41, 59);
      doc.text(`SALDO PENDIENTE: $${Number(jobBalance?.saldo_pendiente || 0).toLocaleString('es-AR')}`, 140, finalY + 31);
    }

    if (invoiceData.observaciones) {
      doc.setFontSize(8);
      doc.text('OBSERVACIONES:', 15, finalY);
      doc.text(invoiceData.observaciones, 15, finalY + 5, { maxWidth: 100 });
    }

    doc.save(`Comprobante_${invoiceData.numero || 'descarga'}.pdf`);
  };

  const onSubmit = async (data: any) => {
    setLoading(true);
    try {
      if (existingInvoiceId) {
        // UPDATE MODE
        const { error: updateError } = await supabase
          .from('t_comprobantes')
          .update({
            tipo: data.tipo,
            fecha: data.fecha,
            numero: data.numero,
            subtotal: data.subtotal,
            iva: data.iva,
            total: data.total,
            estado: data.estado,
            observaciones: data.observaciones,
          })
          .eq('id', existingInvoiceId);

        if (updateError) throw updateError;
        toast.success('Comprobante actualizado');
      } else {
        // INSERT MODE
        if (!job) throw new Error('Se requiere un trabajo para crear una factura nueva desde este modal');

        // 1. Create the invoice
        const { data: invoice, error: invoiceError } = await supabase
          .from('t_comprobantes')
          .insert([{
            cliente_id: data.cliente_id,
            tipo: data.tipo,
            fecha: data.fecha,
            numero: data.numero,
            subtotal: data.subtotal,
            iva: data.iva,
            total: data.total,
            estado: data.estado,
            observaciones: data.observaciones,
          }])
          .select()
          .single();

        if (invoiceError) throw invoiceError;

        // 2. Create the link in t_comprobante_trabajos
        const { error: linkError } = await supabase
          .from('t_comprobante_trabajos')
          .insert([{
            comprobante_id: invoice.id,
            trabajo_id: job.id
          }]);

        if (linkError) throw linkError;

        // 3. Record 'seña' as initial payment if exists
        const senaValue = Number(job.sena || 0);
        if (senaValue > 0) {
          const { error: senaError } = await supabase
            .from('t_comprobante_cobros')
            .insert([{
              comprobante_id: invoice.id,
              tipo: 'Efectivo',
              importe: senaValue,
              fecha: new Date().toISOString().split('T')[0],
              observaciones: 'Pago adelantado (Seña) registrado en preventa'
            }]);
          
          if (senaError) console.error('Error auto-recording deposit:', senaError);
        }

        // --- PDF GENERATION ---
        try {
          generatePDF(data);
        } catch (pdfErr) {
          console.error('PDF Generation failed:', pdfErr);
          toast.error('Comprobante guardado pero falló la descarga del PDF');
        }

        toast.success('Comprobante generado con éxito');
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Billing Error:', err);
      toast.error('Error al procesar factura: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300">
      <div className="bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl border border-white/20 flex flex-col overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-12 duration-500">
        {/* Header */}
        <div className="px-10 py-8 border-b border-outline-variant/10 flex justify-between items-center bg-surface-container-low/30">
          <div>
            <h3 className="text-3xl font-headline font-extrabold text-on-surface tracking-tight">
              {existingInvoiceId ? 'Editar Comprobante' : 'Emitir Comprobante'}
            </h3>
            <p className="text-xs text-on-surface-variant font-bold uppercase tracking-widest mt-1">
              {clientName ? `Cliente: ${clientName}` : (job ? `Vinculado a: ${job.descripcion}` : 'Nuevo Comprobante')}
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-error/10 text-on-surface-variant hover:text-error rounded-full transition-all">
            <span className="material-symbols-outlined text-3xl">close</span>
          </button>
        </div>

        {fetching ? (
          <div className="h-96 flex flex-col items-center justify-center space-y-4">
             <div className="w-10 h-10 border-4 border-primary/10 border-t-primary rounded-full animate-spin"></div>
             <p className="text-[10px] font-black uppercase text-outline/50 tracking-[0.2em]">Cargando datos existentes...</p>
          </div>
        ) : (
          /* Form Body */
          <form onSubmit={handleSubmit(onSubmit)} className="p-10 space-y-8">
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">Tipo de Comprobante</label>
                <select 
                  {...register('tipo', { required: true })}
                  className="w-full bg-surface-container-low border-none rounded-2xl py-3 px-4 text-sm font-bold focus:ring-2 focus:ring-primary/20 appearance-none cursor-pointer"
                >
                  <option>Factura A</option>
                  <option>Factura B</option>
                  <option>Factura C</option>
                  <option>Presupuesto</option>
                  <option>Remito</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">Número</label>
                <input 
                  {...register('numero', { required: true })}
                  placeholder="0001-0000XXXX"
                  className="w-full bg-surface-container-low border-none rounded-2xl py-3 px-4 text-sm font-bold focus:ring-2 focus:ring-primary/20"
                />
                {errors.numero && <p className="text-[10px] text-error font-bold mt-1">Requerido</p>}
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">Estado de Pago</label>
                <select 
                  {...register('estado')}
                  className="w-full bg-surface-container-low border-none rounded-2xl py-3 px-4 text-sm font-bold focus:ring-2 focus:ring-primary/20 appearance-none cursor-pointer"
                >
                  <option value="pendiente">Pendiente</option>
                  <option value="parcial">Parcial</option>
                  <option value="cobrado">Cobrado</option>
                  <option value="anulado">Anulado</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-6 bg-surface-container-low/20 p-6 rounded-3xl border border-outline-variant/5">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">Subtotal</label>
                <input 
                  type="number" step="0.01"
                  {...register('subtotal', { valueAsNumber: true })}
                  className="w-full bg-white border-none rounded-xl py-2 px-4 text-sm font-bold focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">IVA (21%)</label>
                <input 
                  type="number" step="0.01"
                  {...register('iva', { valueAsNumber: true })}
                  className="w-full bg-white border-none rounded-xl py-2 px-4 text-sm font-bold focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">Total Final</label>
                <input 
                  type="number" step="0.01" readOnly
                  {...register('total', { valueAsNumber: true })}
                  className="w-full bg-primary/5 text-primary border-none rounded-xl py-2 px-4 text-lg font-black"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">Observaciones</label>
              <textarea 
                {...register('observaciones')}
                rows={2}
                className="w-full bg-surface-container-low border-none rounded-2xl py-3 px-4 text-sm font-bold focus:ring-2 focus:ring-primary/20 resize-none"
              />
            </div>

            {/* Actions */}
            <div className="flex gap-4 pt-4">
              <button 
                type="button"
                onClick={onClose}
                className="flex-1 py-4 bg-white text-on-surface-variant font-bold rounded-2xl hover:bg-slate-100 transition-all border border-outline-variant/20 active:scale-95 text-xs uppercase tracking-widest"
              >
                Cancelar
              </button>
              
              {existingInvoiceId && (
                <button 
                  type="button"
                  onClick={() => generatePDF(watch())}
                  className="flex-1 py-4 bg-emerald-500 text-white font-bold rounded-2xl shadow-xl shadow-emerald-500/20 hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-2 text-xs uppercase tracking-widest"
                >
                  <span className="material-symbols-outlined text-[1.2rem]">downloading</span>
                  <span>PDF</span>
                </button>
              )}

              <button 
                disabled={loading}
                type="submit"
                className="flex-[2] py-4 bg-primary text-white font-bold rounded-2xl shadow-xl shadow-primary/20 hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-2 text-xs uppercase tracking-widest"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-[1.2rem]">
                      {existingInvoiceId ? 'save' : 'receipt_long'}
                    </span>
                    <span>{existingInvoiceId ? 'Guardar Cambios' : 'Generar Comprobante'}</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default BillingModal;
