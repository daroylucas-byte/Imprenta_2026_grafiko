import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { toast } from 'react-hot-toast';
import Chart from 'chart.js/auto';

interface Metric {
  name: string;
  value: string;
  icon: string;
  color: string;
  label: string;
  bgColor?: string;
  loading?: boolean;
}

interface RecentJob {
  client: string;
  description: string;
  status: string;
  statusColor: string;
  statusIcon: string;
  date: string;
  total: string;
  isFacturado: boolean;
}

interface MonthlyData {
  month: string;
  theoretical: number;
  collected: number;
}

const DashboardPage: React.FC = () => {
  const [metrics, setMetrics] = useState<Metric[]>([
    { name: 'En producción', value: '0', icon: 'precision_manufacturing', color: 'indigo-600', label: 'Taller', bgColor: 'bg-indigo-50' },
    { name: 'Listos para entregar', value: '0', icon: 'verified', color: 'amber-600', label: 'Listos', bgColor: 'bg-amber-50' },
    { name: 'Trabajos entregados', value: '0', icon: 'local_shipping', color: 'emerald-600', label: 'Entregados', bgColor: 'bg-emerald-50' },
    { name: 'Cobrado este mes', value: '$ 0,00', icon: 'account_balance', color: 'primary', label: 'Caja', bgColor: 'bg-primary/10' },
    { name: 'Deuda Total', value: '$ 0,00', icon: 'money_off', color: 'error', label: 'Pendiente', bgColor: 'bg-error/10' },
  ]);
  const [monthlyData, setMonthlyData] = useState<MonthlyData[]>([]);
  const [recentJobs, setRecentJobs] = useState<RecentJob[]>([]);
  const [topProducts, setTopProducts] = useState<{name: string, qty: number}[]>([]);
  const [debtors, setDebtors] = useState<{name: string, balance: number}[]>([]);

  const chartRef = useRef<HTMLCanvasElement>(null);
  const chartInstance = useRef<Chart | null>(null);

  const getStatusInfo = (status: string) => {
    switch (status) {
      case 'PRESUPUESTADO': return { color: 'text-slate-500', bg: 'bg-slate-50', icon: 'description' };
      case 'APROBADO': return { color: 'text-indigo-600', bg: 'bg-indigo-50', icon: 'thumb_up' };
      case 'EN PRODUCCIÓN': return { color: 'text-blue-600', bg: 'bg-blue-50', icon: 'precision_manufacturing' };
      case 'TERMINADO': return { color: 'text-amber-600', bg: 'bg-amber-50', icon: 'verified' };
      case 'ENTREGADO': return { color: 'text-emerald-600', bg: 'bg-emerald-50', icon: 'local_shipping' };
      default: return { color: 'text-slate-500', bg: 'bg-slate-50', icon: 'help' };
    }
  };

  useEffect(() => {
    if (!chartRef.current || !monthlyData.length) return;
    if (chartInstance.current) chartInstance.current.destroy();

    chartInstance.current = new Chart(chartRef.current, {
      type: 'bar',
      data: {
        labels: monthlyData.map(d => d.month),
        datasets: [
          {
            label: 'Vendido (Aprobados)',
            data: monthlyData.map(d => d.theoretical),
            backgroundColor: 'rgba(53, 37, 205, 0.2)',
            borderRadius: 8,
            barPercentage: 0.6,
          },
          {
            label: 'Cobrado Real',
            data: monthlyData.map(d => d.collected),
            backgroundColor: 'rgba(53, 37, 205, 1)',
            borderRadius: 8,
            barPercentage: 0.6,
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { 
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (context) => {
                let label = context.dataset.label || '';
                if (label) label += ': ';
                if (context.parsed.y !== null) {
                  label += new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(context.parsed.y);
                }
                return label;
              }
            }
          }
        },
        scales: {
          x: { 
            grid: { display: false },
            ticks: { font: { weight: 'bold' } }
          },
          y: { 
            beginAtZero: true,
            ticks: { 
              font: { size: 10 },
              callback: (v) => '$' + Number(v).toLocaleString('es-AR') 
            } 
          }
        }
      }
    });
    return () => chartInstance.current?.destroy();
  }, [monthlyData]);

  const fetchData = useCallback(async () => {
    try {
      const now = new Date();
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
      const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1).toISOString().split('T')[0];

      // 1. Fetch Core Data from Views & Tables
      const [
        { data: jobMetrics },
        { data: clientBalances },
        { data: currentPayments },
        { data: currentReceipts },
        { data: recentActivity }
      ] = await Promise.all([
        supabase.from('v_metricas_trabajos').select('estado, total, fecha_aprobacion'),
        supabase.from('v_saldo_clientes').select('*'),
        supabase.from('t_pagos_trabajo').select('importe, fecha').gte('fecha', firstDay),
        supabase.from('t_recibos').select('total, fecha').gte('fecha', firstDay),
        supabase.from('v_metricas_trabajos')
          .select('*, t_clientes(razon_social)')
          .order('fecha_aprobacion', { ascending: false })
          .limit(6)
      ]);

      // Metrics Calculation
      const inProduction = jobMetrics?.filter(j => j.estado === 'EN PRODUCCIÓN').length || 0;
      const readyToDeliver = jobMetrics?.filter(j => j.estado === 'TERMINADO').length || 0;
      const delivered = jobMetrics?.filter(j => j.estado === 'ENTREGADO').length || 0;

      const totalColPayments = currentPayments?.reduce((acc, curr) => acc + (curr.importe || 0), 0) || 0;
      const totalColReceipts = currentReceipts?.reduce((acc, curr) => acc + (curr.total || 0), 0) || 0;
      const totalCollectedMonth = totalColPayments + totalColReceipts;

      const totalDebtGlobal = clientBalances?.reduce((acc, c) => acc + (c.saldo_pendiente > 0 ? c.saldo_pendiente : 0), 0) || 0;

      // 2. Monthly Evolution (Last 6 months)
      const [{ data: historicalPayments }, { data: historicalReceipts }] = await Promise.all([
        supabase.from('t_pagos_trabajo').select('importe, fecha').gte('fecha', sixMonthsAgo),
        supabase.from('t_recibos').select('total, fecha').gte('fecha', sixMonthsAgo)
      ]);

      const monthsNames = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
      const lastSix = Array.from({ length: 6 }).map((_, i) => {
        const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
        const targetMonth = d.getMonth();
        const targetYear = d.getFullYear();
        
        // Sold = Total of jobs approved in that month
        const mTheoretical = jobMetrics?.filter(j => {
          if (!j.fecha_aprobacion) return false;
          const aDate = new Date(j.fecha_aprobacion);
          return aDate.getMonth() === targetMonth && aDate.getFullYear() === targetYear;
        }).reduce((acc, curr) => acc + (curr.total || 0), 0) || 0;

        // Collected = Payments + Receipts in that month
        const mPayments = historicalPayments?.filter(p => {
          const pDate = new Date(p.fecha);
          return pDate.getMonth() === targetMonth && pDate.getFullYear() === targetYear;
        }).reduce((acc, curr) => acc + (curr.importe || 0), 0) || 0;

        const mReceipts = historicalReceipts?.filter(r => {
          const rDate = new Date(r.fecha);
          return rDate.getMonth() === targetMonth && rDate.getFullYear() === targetYear;
        }).reduce((acc, curr) => acc + (curr.total || 0), 0) || 0;

        return {
          month: monthsNames[targetMonth],
          theoretical: mTheoretical,
          collected: mPayments + mReceipts
        };
      });
      setMonthlyData(lastSix);

      // 3. Activity Mapping
      setRecentJobs((recentActivity || []).map((j: any) => {
        const info = getStatusInfo(j.estado);
        return {
          client: j.t_clientes?.razon_social || 'Consumidor Final',
          description: j.nombre_trabajo || j.descripcion || 'Trabajo sin nombre',
          status: j.estado,
          statusColor: info.color,
          statusIcon: info.icon,
          date: j.fecha_aprobacion ? new Date(j.fecha_aprobacion).toLocaleDateString() : 'Pendiente',
          total: `$ ${Number(j.total).toLocaleString('es-AR')}`,
          isFacturado: j.facturado
        };
      }));

      // 4. Debtors (Top 5)
      setDebtors((clientBalances || [])
        .filter(c => c.saldo_pendiente > 1)
        .sort((a, b) => b.saldo_pendiente - a.saldo_pendiente)
        .slice(0, 5)
        .map(c => ({ name: c.razon_social, balance: c.saldo_pendiente }))
      );

      // 5. Top Products
      const { data: itemsData } = await supabase.from('t_trabajo_productos').select('cantidad, t_productos(nombre)');
      const productCounts: Record<string, number> = {};
      itemsData?.forEach((item: any) => {
        const name = item.t_productos?.nombre || 'Desconocido';
        productCounts[name] = (productCounts[name] || 0) + (item.cantidad || 0);
      });
      setTopProducts(Object.entries(productCounts).map(([name, qty]) => ({ name, qty })).sort((a, b) => b.qty - a.qty).slice(0, 5));

      setMetrics([
        { name: 'En producción', value: inProduction.toString(), icon: 'precision_manufacturing', color: 'indigo-600', label: 'Taller', bgColor: 'bg-indigo-50' },
        { name: 'Listos para entregar', value: readyToDeliver.toString(), icon: 'verified', color: 'amber-600', label: 'Listos', bgColor: 'bg-amber-50' },
        { name: 'Trabajos entregados', value: delivered.toString(), icon: 'local_shipping', color: 'emerald-600', label: 'Entregados', bgColor: 'bg-emerald-50' },
        { name: 'Cobrado este mes', value: `$ ${totalCollectedMonth.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`, icon: 'account_balance', color: 'primary', label: 'Caja', bgColor: 'bg-primary/10' },
        { name: 'Deuda Total', value: `$ ${totalDebtGlobal.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`, icon: 'money_off', color: 'error', label: 'Pendiente', bgColor: 'bg-error/10' },
      ]);

    } catch (err: any) {
      toast.error('Error al cargar datos del dashboard: ' + err.message);
    } finally {
      // Done
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in duration-700">
      {/* Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {metrics.map((metric, idx) => (
          <div key={idx} className={`p-6 rounded-[2.5rem] border border-outline-variant/10 shadow-sm flex items-center justify-between group hover:scale-[1.02] transition-all bg-white`}>
            <div className="flex items-center gap-4">
              <div className={`w-12 h-12 rounded-2xl ${metric.bgColor} flex items-center justify-center`}>
                <span className={`material-symbols-outlined text-2xl text-${metric.color}`}>{metric.icon}</span>
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">{metric.name}</p>
                <h3 className="text-2xl font-headline font-extrabold text-on-surface">{metric.value}</h3>
              </div>
            </div>
            <span className="text-[10px] font-black uppercase tracking-tighter text-outline/30 group-hover:text-primary/40 transition-colors">{metric.label}</span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Sales Chart */}
        <div className="lg:col-span-2 bg-white p-8 rounded-[2.5rem] border border-outline-variant/10 shadow-sm space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h4 className="text-lg font-headline font-extrabold text-on-surface">Evolución Comercial</h4>
              <p className="text-xs text-on-surface-variant font-bold">Ventas aprobadas vs Cobros reales (6 meses)</p>
            </div>
            <div className="flex gap-4">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-primary/20"></div>
                <span className="text-[10px] font-black uppercase tracking-widest">Vendido</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-primary"></div>
                <span className="text-[10px] font-black uppercase tracking-widest">Cobrado</span>
              </div>
            </div>
          </div>
          <div className="h-64 relative">
            <canvas ref={chartRef}></canvas>
          </div>
        </div>

        {/* Top Debtors */}
        <div className="bg-white p-8 rounded-[2.5rem] border border-outline-variant/10 shadow-sm space-y-6">
          <div className="flex items-center gap-3">
             <div className="w-8 h-8 rounded-xl bg-error/10 flex items-center justify-center text-error">
                <span className="material-symbols-outlined text-sm">trending_down</span>
             </div>
             <h4 className="text-lg font-headline font-extrabold text-on-surface">Mayores Deudores</h4>
          </div>
          <div className="space-y-4">
            {debtors.length > 0 ? debtors.map((debtor, idx) => (
              <div key={idx} className="flex items-center justify-between p-4 rounded-2xl bg-surface-container-low hover:bg-surface-container-lowest transition-colors border border-outline-variant/5">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center text-[10px] font-black text-primary shadow-sm border border-outline-variant/10">
                    {idx + 1}
                  </div>
                  <span className="text-xs font-black text-on-surface-variant truncate max-w-[120px]">{debtor.name}</span>
                </div>
                <span className="text-xs font-black text-error">$ {debtor.balance.toLocaleString('es-AR')}</span>
              </div>
            )) : (
              <div className="text-center py-10 opacity-20 italic text-xs font-bold">No hay deudores registrados</div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Recent Activity */}
        <div className="lg:col-span-2 bg-white p-8 rounded-[2.5rem] border border-outline-variant/10 shadow-sm space-y-6">
          <div className="flex items-center gap-3">
             <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                <span className="material-symbols-outlined text-sm">history</span>
             </div>
             <h4 className="text-lg font-headline font-extrabold text-on-surface">Actividad en Tiempo Real</h4>
          </div>
          <div className="overflow-x-auto no-scrollbar">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-outline-variant/10">
                  <th className="pb-4 text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Cliente</th>
                  <th className="pb-4 text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Trabajo</th>
                  <th className="pb-4 text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Estado</th>
                  <th className="pb-4 text-[10px] font-black uppercase tracking-widest text-on-surface-variant text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/5">
                {recentJobs.map((job, idx) => (
                  <tr key={idx} className="group hover:bg-surface-container-low/30 transition-colors">
                    <td className="py-4">
                      <p className="text-xs font-black text-on-surface">{job.client}</p>
                      <p className="text-[10px] font-bold text-on-surface-variant opacity-60">{job.date}</p>
                    </td>
                    <td className="py-4">
                      <p className="text-xs font-bold text-on-surface-variant truncate max-w-[200px]">{job.description}</p>
                    </td>
                    <td className="py-4">
                      <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full ${job.statusColor.replace('text-', 'bg-').replace('600', '100')} ${job.statusColor} text-[10px] font-black uppercase tracking-tighter`}>
                        <span className="material-symbols-outlined text-[14px]">{job.statusIcon}</span>
                        {job.status}
                      </div>
                    </td>
                    <td className="py-4 text-right">
                      <span className="text-xs font-black text-on-surface">{job.total}</span>
                      {job.isFacturado && <span className="ml-2 material-symbols-outlined text-emerald-500 text-sm align-middle">verified</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Top Products */}
        <div className="bg-white p-8 rounded-[2.5rem] border border-outline-variant/10 shadow-sm space-y-6">
          <div className="flex items-center gap-3">
             <div className="w-8 h-8 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-600">
                <span className="material-symbols-outlined text-sm">stars</span>
             </div>
             <h4 className="text-lg font-headline font-extrabold text-on-surface">Más Vendidos</h4>
          </div>
          <div className="space-y-4">
            {topProducts.map((p, idx) => (
              <div key={idx} className="space-y-2">
                <div className="flex justify-between text-xs font-black uppercase tracking-tighter">
                  <span className="text-on-surface-variant">{p.name}</span>
                  <span className="text-primary">{p.qty} unid.</span>
                </div>
                <div className="h-1.5 w-full bg-surface-container-low rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-primary rounded-full transition-all duration-1000" 
                    style={{ width: `${(p.qty / topProducts[0].qty) * 100}%` }}
                  ></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;
