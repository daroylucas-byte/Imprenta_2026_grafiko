import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { supabase } from '../lib/supabase';
import { toast } from 'react-hot-toast';

export const printJobVoucher = async (jobId: string) => {
  try {
    // 1. Fetch all necessary data
    const [
      { data: job, error: jobErr },
      { data: items, error: itemsErr },
      { data: saldo, error: saldoErr },
      { data: soportes },
      { data: sistemas },
      { data: tamanios },
      { data: peliculados },
      { data: acabados },
      { data: terminaciones },
      { data: entregas },
      { data: clientes }
    ] = await Promise.all([
      supabase.from('t_trabajos').select('*').eq('id', jobId).single(),
      supabase.from('t_trabajo_productos').select('*').eq('trabajo_id', jobId),
      supabase.from('v_saldo_trabajos').select('*').eq('id', jobId).single(),
      supabase.from('t_conf_soportes').select('id, nombre'),
      supabase.from('t_conf_sistemas_impresion').select('id, nombre'),
      supabase.from('t_conf_tamanios_papel').select('id, nombre'),
      supabase.from('t_conf_peliculados').select('id, nombre'),
      supabase.from('t_conf_acabados').select('id, nombre'),
      supabase.from('t_conf_terminaciones').select('id, nombre'),
      supabase.from('t_conf_tipos_entrega').select('id, nombre'),
      supabase.from('t_clientes').select('id, razon_social')
    ]);

    if (jobErr || itemsErr || saldoErr) {
      throw new Error('No se pudo cargar la información del trabajo');
    }

    const doc = new jsPDF();
    const client = clientes?.find(c => c.id === job.cliente_id);

    // --- Header ---
    doc.setFillColor(30, 41, 59); // Slate-800
    doc.rect(0, 0, 210, 40, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(24);
    doc.text('GRAFIKO', 15, 20);
    doc.setFontSize(10);
    doc.text('Sistema de Gestión de Imprenta', 15, 30);

    doc.setFontSize(14);
    doc.text('COMPROBANTE DE TRABAJO', 120, 20);
    doc.setFontSize(10);
    doc.text(`ID: ${jobId.slice(0, 8)}`, 120, 27);
    doc.text(`Fecha Emisión: ${new Date().toLocaleDateString('es-AR')}`, 120, 33);

    // --- Client & Job Summary ---
    doc.setTextColor(30, 41, 59);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('INFORMACIÓN DEL CLIENTE', 15, 55);
    doc.line(15, 57, 100, 57);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`Razón Social: ${client?.razon_social || 'N/A'}`, 15, 65);
    doc.text(`Trabajo: ${job.descripcion}`, 15, 72);
    doc.text(`Estado: ${job.estado}`, 15, 79);
    if (job.fecha) {
      doc.text(`Fecha de Ingreso: ${new Date(job.fecha + 'T12:00:00').toLocaleDateString('es-AR')}`, 15, 86);
    }

    if (job.estado === 'PRESUPUESTADO' && job.fecha_vencimiento_presupuesto) {
      doc.setTextColor(220, 38, 38); // red-600, coincide con el color del campo en el formulario
      doc.text(`Validez del Presupuesto: ${new Date(job.fecha_vencimiento_presupuesto + 'T12:00:00').toLocaleDateString('es-AR')}`, 15, 93);
      doc.setTextColor(30, 41, 59);
    } else if (job.fecha_entrega) {
      doc.text(`Fecha de Entrega Prometida: ${new Date(job.fecha_entrega + 'T12:00:00').toLocaleDateString('es-AR')}`, 15, 93);
    }

    // --- Technical Specs ---
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('ESPECIFICACIONES TÉCNICAS', 115, 55);
    doc.line(115, 57, 195, 57);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);

    const soporte = soportes?.find(s => s.id === job.soporte_id)?.nombre || 'N/A';
    const sistema = sistemas?.find(s => s.id === job.sistema_impresion_id)?.nombre || 'N/A';
    const tamanio = tamanios?.find(t => t.id === job.tamanio_papel_id)?.nombre || 'N/A';
    const peliculado = peliculados?.find(p => p.id === job.peliculado_id)?.nombre || 'N/A';
    const acabado = acabados?.find(a => a.id === job.acabado_id)?.nombre || 'N/A';
    const terminacion = terminaciones?.find(t => t.id === job.terminacion_id)?.nombre || 'N/A';
    const entrega = entregas?.find(e => e.id === job.tipo_entrega_id)?.nombre || 'N/A';

    doc.text(`Soporte: ${soporte}`, 115, 65);
    doc.text(`Sistema: ${sistema}`, 115, 71);
    doc.text(`Tamaño: ${tamanio}`, 115, 77);
    doc.text(`Peliculado: ${peliculado}`, 115, 83);
    doc.text(`Acabado: ${acabado}`, 115, 89);
    doc.text(`Terminación: ${terminacion}`, 115, 95);
    doc.text(`Entrega: ${entrega}`, 115, 101);

    // --- Budget Conditions (checkboxes + observaciones) ---
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('CONDICIONES DEL PRESUPUESTO', 15, 90);
    doc.line(15, 92, 100, 92);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(`Incluye IVA: ${job.incluye_iva ? 'Sí' : 'No'}`, 15, 100);
    doc.text(`Incluye Diseño: ${job.incluye_diseno ? 'Sí' : 'No'}`, 15, 106);
    doc.text(`Incluye Troquel: ${job.incluye_troquel ? 'Sí' : 'No'}`, 15, 112);
    doc.text(`Requiere Seña: ${job.requiere_sena ? 'Sí' : 'No'}`, 15, 118);

    // --- Items Table ---
    const tableData = (items || []).map(item => [
      item.nombre || 'Producto',
      item.cantidad,
      `$${(Number(item.precio_unitario) || 0).toLocaleString('es-AR')}`,
      `$${(Number(item.subtotal) || 0).toLocaleString('es-AR')}`
    ]);

    autoTable(doc, {
      startY: 126,
      head: [['Producto', 'Cant.', 'Precio Unit.', 'Subtotal']],
      body: tableData,
      headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: 'bold' },
      styles: { fontSize: 9, cellPadding: 3 },
      columnStyles: {
        1: { halign: 'center' },
        2: { halign: 'right' },
        3: { halign: 'right' }
      }
    });

    // --- Observaciones ---
    if (job.observaciones) {
      const obsY = (doc as any).lastAutoTable.finalY + 10;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(30, 41, 59);
      doc.text('OBSERVACIONES:', 15, obsY);
      doc.setFont('helvetica', 'normal');
      doc.text(job.observaciones, 15, obsY + 5, { maxWidth: 100 });
    }

    // --- Financial Summary ---
    const finalY = (doc as any).lastAutoTable.finalY + 15;
    doc.setFillColor(248, 250, 252); // slate-50
    doc.rect(120, finalY, 75, 45, 'F');
    doc.setDrawColor(226, 232, 240);
    doc.rect(120, finalY, 75, 45, 'S');

    doc.setFontSize(10);
    doc.setTextColor(71, 85, 105);
    doc.text('TOTAL:', 125, finalY + 10);
    doc.text('PAGOS/SEÑA:', 125, finalY + 20);
    
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 41, 59);
    doc.text(`$${(Number(saldo.total) || 0).toLocaleString('es-AR')}`, 190, finalY + 10, { align: 'right' });
    
    const totalPagado = (Number(saldo.total_pagado_directo) || 0) + (Number(saldo.total_aplicado_cc) || 0);
    doc.setTextColor(5, 150, 105); // emerald-600
    doc.text(`$${totalPagado.toLocaleString('es-AR')}`, 190, finalY + 20, { align: 'right' });

    doc.setFontSize(12);
    doc.setTextColor(220, 38, 38); // red-600
    doc.text('SALDO A PAGAR:', 125, finalY + 35);
    doc.text(`$${(Number(saldo.saldo_pendiente) || 0).toLocaleString('es-AR')}`, 190, finalY + 35, { align: 'right' });

    // Footer
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.setFont('helvetica', 'normal');
    doc.text('Este documento es un comprobante de trabajo y estado de cuenta, no válido como factura fiscal.', 15, 280);

    doc.save(`Trabajo_${jobId.slice(0, 8)}_${client?.razon_social || 'cliente'}.pdf`);
    toast.success('Comprobante generado con éxito');
  } catch (err: any) {
    console.error(err);
    toast.error('Error al generar comprobante: ' + err.message);
  }
};
