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
      { data: clientes }
    ] = await Promise.all([
      supabase.from('t_trabajos').select('*').eq('id', jobId).single(),
      supabase.from('t_trabajo_productos').select('*').eq('trabajo_id', jobId),
      supabase.from('v_saldo_trabajos').select('*').eq('id', jobId).single(),
      supabase.from('t_conf_soportes').select('id, nombre'),
      supabase.from('t_conf_sistemas_impresion').select('id, nombre'),
      supabase.from('t_conf_tamanios_papel').select('id, nombre'),
      supabase.from('t_conf_peliculados').select('id, nombre'),
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
    
    doc.text(`Soporte: ${soporte}`, 115, 65);
    doc.text(`Sistema: ${sistema}`, 115, 71);
    doc.text(`Tamaño: ${tamanio}`, 115, 77);
    doc.text(`Peliculado: ${peliculado}`, 115, 83);

    // --- Items Table ---
    const tableData = (items || []).map(item => [
      item.nombre || 'Producto',
      item.cantidad,
      `$${(Number(item.precio_unitario) || 0).toLocaleString('es-AR')}`,
      `$${(Number(item.subtotal) || 0).toLocaleString('es-AR')}`
    ]);

    autoTable(doc, {
      startY: 95,
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
