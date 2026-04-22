import React, { useState, useEffect, useRef } from 'react';
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
  isAlt?: boolean;
  isFacturado: boolean;
  paymentLabel: string;
  paymentColor: string;
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
    { name: 'Facturado este mes', value: '$ 0,00', icon: 'description', color: 'blue-600', label: 'Facturación', bgColor: 'bg-blue-50' },
    { name: 'Cobrado este mes', value: '$ 0,00', icon: 'account_balance', color: 'primary', label: 'Caja', bgColor: 'bg-primary/10' },
    { name: 'Deuda Total', value: '$ 0,00', icon: 'money_off', color: 'error', label: 'Pendiente', bgColor: 'bg-error/10' },
  ]);
  const [monthlyData, setMonthlyData] = useState<MonthlyData[]>([]);

  const [recentJobs, setRecentJobs] = useState<RecentJob[]>([]);
  const [topProducts, setTopProducts] = useState<{name: string, qty: number}[]>([]);
  const [debtors, setDebtors] = useState<{name: string, balance: number}[]>([]);
  const [loading, setLoading] = useState(true);

  const chartRef = useRef<HTMLCanvasElement>(null);
  const chartInstance = useRef<Chart | null>(null);

  useEffect(() => {
    if (!chartRef.current || !monthlyData.length) return;
    if (chartInstance.current) chartInstance.current.destroy();

    chartInstance.current = new Chart(chartRef.current, {
      type: 'bar',
      data: {
        labels: monthlyData.map(d => d.month),
        datasets: [
          {
            label: 'Teórico',
            data: monthlyData.map(d => d.theoretical),
            backgroundColor: 'rgba(53, 37, 205, 0.2)',
            borderRadius: 8,
            barPercentage: 0.6,
          },
          {
            label: 'Cobrado',
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

  const fetchData = React.useCallback(async () => {
    setLoading(true);
    try {
      const now = new Date();
      const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1).toISOString();

      // 1. Fetch Core Data
      const [
        { data: jobStats }, 
        { data: collCurrent }, 
        { data: senaCurrent },
        { data: invoiceCurrent },
        { data: receiptCurrent }
      ] = await Promise.all([
        supabase.from('t_trabajos').select('estado, total, sena, created_at, cliente_id, descripcion, id'),
        supabase.from('t_comprobante_cobros').select('importe, fecha, observaciones').gte('fecha', firstDayOfMonth.split('T')[0]),
        supabase.from('t_trabajos').select('sena, created_at').gte('created_at', firstDayOfMonth),
        supabase.from('t_comprobantes').select('total').gte('fecha', firstDayOfMonth.split('T')[0]),
        supabase.from('t_recibos').select('total, fecha').gte('fecha', firstDayOfMonth.split('T')[0])
      ]);

      const inProduction = jobStats?.filter(j => j.estado === 'EN PRODUCCIÓN').length || 0;
      const readyToDeliver = jobStats?.filter(j => j.estado === 'LISTO PARA ENTREGAR').length || 0;
      const delivered = jobStats?.filter(j => j.estado === 'ENTREGADOS').length || 0;

      // Logic: Sum Receipts + Independent Payments (excluding automatic Senas) + Monthly Senas
      const totalColReceipts = receiptCurrent?.reduce((acc, curr) => acc + (curr.total || 0), 0) || 0;
      const totalColPayments = collCurrent?.filter(p => !p.observaciones?.includes('Seña')).reduce((acc, curr) => acc + (curr.importe || 0), 0) || 0;
      const totalColSenas = senaCurrent?.reduce((acc, curr) => acc + (curr.sena || 0), 0) || 0;
      
      const totalCollectedCurrent = totalColReceipts + totalColPayments + totalColSenas;
      const totalInvoicedCurrent = invoiceCurrent?.reduce((acc, curr) => acc + (curr.total || 0), 0) || 0;

      // 2. Monthly Evolution Data (Last 6 months)
      const [
        { data: allReceipts },
        { data: allPayments }
      ] = await Promise.all([
        supabase.from('t_recibos').select('total, fecha').gte('fecha', sixMonthsAgo.split('T')[0]),
        supabase.from('t_comprobante_cobros').select('importe, fecha, observaciones').gte('fecha', sixMonthsAgo.split('T')[0])
      ]);
      
      const monthsNames = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
      const lastSix = Array.from({ length: 6 }).map((_, i) => {
        const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
        const targetMonth = d.getMonth();
        const targetYear = d.getFullYear();
        
        const mTheoretical = jobStats?.filter(j => {
          const cDate = new Date(j.created_at);
          return cDate.getMonth() === targetMonth && cDate.getFullYear() === targetYear;
        }).reduce((acc, curr) => acc + (curr.total || 0), 0) || 0;

        const mReceipts = allReceipts?.filter(r => {
          const rDate = new Date(r.fecha);
          return rDate.getMonth() === targetMonth && rDate.getFullYear() === targetYear;
        }).reduce((acc, curr) => acc + (curr.total || 0), 0) || 0;

        const mPayments = allPayments?.filter(p => {
          const pDate = new Date(p.fecha);
          return pDate.getMonth() === targetMonth && pDate.getFullYear() === targetYear && !p.observaciones?.includes('Seña');
        }).reduce((acc, curr) => acc + (curr.importe || 0), 0) || 0;

        const mSenas = jobStats?.filter(j => {
          const cDate = new Date(j.created_at);
          return cDate.getMonth() === targetMonth && cDate.getFullYear() === targetYear;
        }).reduce((acc, curr) => acc + (curr.sena || 0), 0) || 0;

        return {
          month: monthsNames[targetMonth],
          theoretical: mTheoretical,
          collected: mReceipts + mPayments + mSenas
        };
      });
      setMonthlyData(lastSix);

      // 3. Top Products Stats (omit for brevity, same logic)
      const { data: itemsData } = await supabase.from('t_trabajo_productos').select('cantidad, t_productos(nombre)');
      const productCounts: Record<string, number> = {};
      itemsData?.forEach((item: any) => {
        const name = item.t_productos?.nombre || 'Desconocido';
        productCounts[name] = (productCounts[name] || 0) + (item.cantidad || 0);
      });
      setTopProducts(Object.entries(productCounts).map(([name, qty]) => ({ name, qty })).sort((a, b) => b.qty - a.qty).slice(0, 5));

      // 4. Debtors (Calculated balance per client)
      const [
        { data: clientsData }, 
        { data: voucherTotals }, 
        { data: receiptTotals }, 
        { data: paymentTotals }
      ] = await Promise.all([
        supabase.from('t_clientes').select('id, razon_social'),
        supabase.from('t_comprobantes').select('cliente_id, total'),
        supabase.from('t_recibos').select('cliente_id, total'),
        supabase.from('t_comprobante_cobros').select('importe, observaciones, t_comprobantes!inner(cliente_id)')
      ]);

      const globalJobSenas = jobStats?.reduce((acc: any, j: any) => {
        acc[j.cliente_id] = (acc[j.cliente_id] || 0) + (j.sena || 0);
        return acc;
      }, {}) || {};

      const totalDebtValue = (clientsData || []).reduce((sum, client) => {
        const tDebe = (voucherTotals || []).filter(v => v.cliente_id === client.id).reduce((acc, curr) => acc + Number(curr.total), 0);
        const tReceipts = (receiptTotals || []).filter(r => r.cliente_id === client.id).reduce((acc, curr) => acc + Number(curr.total), 0);
        const tPayments = (paymentTotals || []).filter((p: any) => p.t_comprobantes?.cliente_id === client.id && !p.observaciones?.includes('Seña')).reduce((acc, curr) => acc + Number(curr.importe), 0);
        const tSenas = globalJobSenas[client.id] || 0;
        
        const balance = tDebe - (tReceipts + tPayments + tSenas);
        return sum + (balance > 1 ? balance : 0);
      }, 0);

      const calculatedDebtors = (clientsData || []).map(client => {
        const tDebe = (voucherTotals || []).filter(v => v.cliente_id === client.id).reduce((acc, curr) => acc + Number(curr.total), 0);
        const tReceipts = (receiptTotals || []).filter(r => r.cliente_id === client.id).reduce((acc, curr) => acc + Number(curr.total), 0);
        const tPayments = (paymentTotals || []).filter((p: any) => p.t_comprobantes?.cliente_id === client.id && !p.observaciones?.includes('Seña')).reduce((acc, curr) => acc + Number(curr.importe), 0);
        const tSenas = globalJobSenas[client.id] || 0;
        return { name: client.razon_social, balance: tDebe - (tReceipts + tPayments + tSenas) };
      })
      .filter(d => d.balance > 1)
      .sort((a, b) => b.balance - a.balance)
      .slice(0, 5);

      setDebtors(calculatedDebtors);

      setMetrics([
        { name: 'En producción', value: inProduction.toString(), icon: 'precision_manufacturing', color: 'indigo-600', label: 'Taller', bgColor: 'bg-indigo-50' },
        { name: 'Listos para entregar', value: readyToDeliver.toString(), icon: 'verified', color: 'amber-600', label: 'Listos', bgColor: 'bg-amber-50' },
        { name: 'Trabajos entregados', value: delivered.toString(), icon: 'local_shipping', color: 'emerald-600', label: 'Entregados', bgColor: 'bg-emerald-50' },
        { name: 'Facturado este mes', value: `$ ${totalInvoicedCurrent.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`, icon: 'description', color: 'blue-600', label: 'Facturación', bgColor: 'bg-blue-50' },
        { name: 'Cobrado este mes', value: `$ ${totalCollectedCurrent.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`, icon: 'account_balance', color: 'primary', label: 'Caja', bgColor: 'bg-primary/10' },
        { name: 'Deuda Total', value: `$ ${totalDebtValue.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`, icon: 'money_off', color: 'error', label: 'Pendiente', bgColor: 'bg-error/10' },
      ]);

      const { data: recentData } = await supabase.from('t_trabajos').select(`id, descripcion, estado, total, created_at, t_clientes (razon_social), t_comprobante_trabajos(comprobante_id)`).order('created_at', { ascending: false }).limit(6);
      setRecentJobs(recentData?.map((j: any) => ({
        client: Array.isArray(j.t_clientes) ? j.t_clientes[0]?.razon_social : j.t_clientes?.razon_social || 'Desconocido',
        description: j.descripcion,
        status: j.estado,
        statusColor: j.estado === 'EN PRODUCCIÓN' ? 'indigo' : j.estado === 'LISTO PARA ENTREGAR' ? 'amber' : 'emerald',
        statusIcon: j.estado === 'EN PRODUCCIÓN' ? 'precision_manufacturing' : j.estado === 'LISTO PARA ENTREGAR' ? 'verified' : 'local_shipping',
        date: new Date(j.created_at).toLocaleDateString(),
        total: `$ ${j.total.toLocaleString()}`,
        isFacturado: (j.t_comprobante_trabajos || []).length > 0,
        paymentLabel: (j.t_comprobante_trabajos || []).length > 0 ? 'Facturado' : 'Pendiente',
        paymentColor: (j.t_comprobante_trabajos || []).length > 0 ? 'emerald' : 'amber'
      })) || []);

    } catch (error: any) {
      console.error(error);
      toast.error('Error al cargar datos: ' + error.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Metric Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6 gap-5">
        {metrics.map((metric) => (
          <div key={metric.name} className="bg-surface-container-lowest p-5 rounded-[2rem] shadow-sm border border-outline-variant/10 hover:border-primary/50 transition-all group">
            <div className="flex justify-between items-start mb-3">
              <div className={`p-3 ${metric.bgColor || 'bg-primary/10'} rounded-2xl`}>
                <span className={`material-symbols-outlined text-xl`}>{metric.icon}</span>
              </div>
              <span className={`text-[9px] font-black tracking-widest uppercase text-on-surface-variant`}>
                {metric.label}
              </span>
            </div>
            <p className="text-outline text-[10px] font-bold uppercase tracking-wider mb-1 line-clamp-1">{metric.name}</p>
            <h3 className="text-xl font-headline font-black text-on-surface truncate">
              {loading ? '...' : metric.value}
            </h3>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Monthly Chart & Table */}
        <div className="lg:col-span-8 space-y-8">
          {/* Main Chart Box */}
          <div className="bg-surface-container-lowest p-8 rounded-[3rem] border border-outline-variant/10 shadow-sm overflow-hidden relative group">
            <div className="flex justify-between items-center mb-12">
              <div>
                <h3 className="text-2xl font-headline font-black text-on-surface mb-1">Ingresos y Cobros</h3>
                <p className="text-sm font-medium text-on-surface-variant flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-primary/30"></span> Evolución Mensual (Últimos 6 meses)
                </p>
              </div>
              <div className="p-4 bg-primary/5 rounded-2xl">
                 <span className="material-symbols-outlined text-primary font-bold">trending_up</span>
              </div>
            </div>

            <div className="relative h-72 w-full px-2">
              <canvas ref={chartRef} />
            </div>

            <div className="mt-12 bg-surface-container/30 p-6 rounded-[2rem] flex flex-wrap items-center gap-6">
               <div className="flex items-center gap-2">
                 <div className="w-3 h-3 rounded-sm bg-primary/20"></div>
                 <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Ingreso Teórico (Vendido)</span>
               </div>
               <div className="flex items-center gap-2">
                 <div className="w-3 h-3 rounded-sm bg-primary"></div>
                 <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Ingreso Efectivo (Cobrado)</span>
               </div>
               <p className="ml-auto text-[10px] font-medium text-on-surface-variant/50 text-right italic">
                 * Incluye cobros directos y señas en preventa.
               </p>
            </div>
          </div>

          {/* Recent Jobs Table */}
          <div className="bg-surface-container-lowest rounded-[3rem] border border-outline-variant/10 shadow-sm overflow-hidden">
            <div className="p-8 border-b border-outline-variant/10 flex justify-between items-center bg-surface-container-lowest/50">
              <div>
                <h3 className="text-xl font-headline font-black text-on-surface uppercase tracking-tight">Actividad en Tiempo Real</h3>
                <p className="text-[10px] font-black text-outline uppercase tracking-[0.2em] mt-1">Monitoreo de producción</p>
              </div>
              <button className="px-5 py-2.5 rounded-full bg-primary/5 text-primary text-[10px] font-black uppercase hover:bg-primary/10 transition-colors">
                Historial completo
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-surface-container/30">
                  <tr>
                    <th className="px-8 py-5 text-[10px] font-black text-outline uppercase tracking-widest">Cliente / ID</th>
                    <th className="px-6 py-5 text-[10px] font-black text-outline uppercase tracking-widest">Descripción</th>
                    <th className="px-6 py-5 text-[10px] font-black text-outline uppercase tracking-widest text-center">Estado</th>
                    <th className="px-8 py-5 text-[10px] font-black text-outline uppercase tracking-widest text-right">Monto</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/5">
                  {recentJobs.map((j, idx) => (
                    <tr key={idx} className="hover:bg-primary/[0.02] transition-colors group">
                      <td className="px-8 py-5">
                         <p className="text-sm font-bold text-on-surface group-hover:text-primary transition-colors">{j.client}</p>
                         <p className="text-[9px] text-outline font-black mt-0.5 tracking-tighter uppercase">{j.date}</p>
                      </td>
                      <td className="px-6 py-5">
                         <p className="text-xs text-on-surface-variant font-medium line-clamp-1">{j.description}</p>
                      </td>
                      <td className="px-6 py-5 text-center">
                         <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-tighter bg-${j.statusColor}-100 text-${j.statusColor}-700`}>
                           {j.status}
                         </span>
                      </td>
                      <td className="px-8 py-5 text-right">
                         <p className="text-sm font-black text-on-surface">{j.total}</p>
                         <p className={`text-[8px] font-black uppercase text-${j.paymentColor}-600`}>{j.paymentLabel}</p>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right Column: Mini Chart & Products */}
        <div className="lg:col-span-4 space-y-8">
           {/* Ranking de Deudores */}
           <div className="bg-on-surface p-8 rounded-[3rem] shadow-xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-primary/20 blur-[80px] -mr-16 -mt-16 group-hover:bg-primary/40 transition-colors"></div>
            
            <div className="relative mb-8 flex justify-between items-center">
              <div>
                <h3 className="text-xl font-headline font-black text-surface italic uppercase tracking-tighter">Ranking Deudores</h3>
                <p className="text-[9px] font-black text-outline-variant uppercase tracking-[0.2em] opacity-60">Top 5 compromisos pendientes</p>
              </div>
              <span className="material-symbols-outlined text-primary text-3xl font-bold">money_off</span>
            </div>

            <div className="space-y-6 relative">
              {debtors.length > 0 ? debtors.map((d, i) => (
                <div key={i} className="group/item">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-[11px] font-bold text-surface/90 uppercase tracking-tight truncate max-w-[150px]">{d.name}</span>
                    <span className="text-[11px] font-black text-primary">$ {d.balance.toLocaleString()}</span>
                  </div>
                  <div className="h-1.5 w-full bg-surface/5 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-primary/40 to-primary transition-all duration-1000 delay-300"
                      style={{ width: `${Math.min((d.balance / (debtors[0]?.balance || 1)) * 100, 100)}%` }}
                    />
                  </div>
                </div>
              )) : (
                <div className="py-8 text-center bg-surface/5 rounded-2xl border border-dashed border-surface/20">
                   <p className="text-[10px] font-black text-surface/40 uppercase tracking-widest italic">No hay deuda detectada</p>
                </div>
              )}
            </div>

            <div className="mt-10 pt-6 border-t border-surface/10">
               <p className="text-[9px] text-surface/50 font-medium italic leading-relaxed">
                 * El balance refleja la diferencia entre facturación real y cobros (incluyendo señas).
               </p>
            </div>
          </div>

          {/* Top Products Box */}
          <div className="bg-surface-container-lowest p-8 rounded-[3rem] border border-outline-variant/10 shadow-sm relative overflow-hidden">
            <div className="flex justify-between items-center mb-8">
               <div>
                <h3 className="text-xl font-headline font-black text-on-surface uppercase tracking-tight">Best Sellers</h3>
                <p className="text-[10px] font-black text-outline uppercase tracking-[0.2em]">Por volumen de salida</p>
              </div>
              <div className="w-12 h-12 bg-amber-100 rounded-2xl flex items-center justify-center">
                 <span className="material-symbols-outlined text-amber-700 font-bold">workspace_premium</span>
              </div>
            </div>

            <div className="space-y-6">
              {topProducts.map((p, i) => (
                <div key={p.name} className="flex items-center gap-4 group/prod">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-xs ${
                    i === 0 ? 'bg-amber-100 text-amber-700' : 
                    i === 1 ? 'bg-slate-100 text-slate-700' :
                    'bg-primary/5 text-primary'
                  }`}>
                    {i + 1}
                  </div>
                  <div className="flex-1">
                    <div className="flex justify-between mb-1">
                       <span className="text-[10px] font-black text-on-surface uppercase tracking-tight truncate max-w-[120px]">{p.name}</span>
                       <span className="text-[10px] font-black text-primary">{p.qty} unid.</span>
                    </div>
                    <div className="h-1.5 w-full bg-surface-container rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-primary rounded-full group-hover/prod:opacity-80 transition-opacity" 
                        style={{ width: `${(p.qty / (topProducts[0]?.qty || 1)) * 100}%` }}
                      ></div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;
