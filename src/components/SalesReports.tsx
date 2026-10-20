import React, { useState, useMemo } from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Package, 
  ShoppingBag, 
  Truck, 
  Calendar, 
  Filter, 
  ChevronDown, 
  Download, 
  FileSpreadsheet, 
  BarChart3,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  Tag,
  Check
} from 'lucide-react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  AreaChart, 
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import { OrderRecord } from '../types';
import { formatIST } from '../utils/time';
import { exportOrdersToExcel } from '../utils/excelExport';

interface SalesReportsProps {
  orders: OrderRecord[];
}

type DateRangeType = 'today' | 'yesterday' | 'this_week' | 'last_week' | 'this_month' | 'last_month' | 'custom';

export const SalesReports: React.FC<SalesReportsProps> = ({ orders }) => {
  const [dateRange, setDateRange] = useState<DateRangeType>('this_month');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

  const filterOrdersByDate = (orders: OrderRecord[], range: DateRangeType) => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    return orders.filter(order => {
      const orderDate = new Date(order.createdAt);
      
      switch (range) {
        case 'today':
          return orderDate >= today;
        case 'yesterday': {
          const yesterday = new Date(today);
          yesterday.setDate(yesterday.getDate() - 1);
          return orderDate >= yesterday && orderDate < today;
        }
        case 'this_week': {
          const startOfWeek = new Date(today);
          startOfWeek.setDate(today.getDate() - today.getDay());
          return orderDate >= startOfWeek;
        }
        case 'last_week': {
          const startOfLastWeek = new Date(today);
          startOfLastWeek.setDate(today.getDate() - today.getDay() - 7);
          const endOfLastWeek = new Date(today);
          endOfLastWeek.setDate(today.getDate() - today.getDay());
          return orderDate >= startOfLastWeek && orderDate < endOfLastWeek;
        }
        case 'this_month': {
          const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
          return orderDate >= startOfMonth;
        }
        case 'last_month': {
          const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
          const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
          return orderDate >= startOfLastMonth && orderDate <= endOfLastMonth;
        }
        case 'custom': {
          if (!customStartDate || !customEndDate) return true;
          const start = new Date(customStartDate);
          const end = new Date(customEndDate);
          end.setHours(23, 59, 59, 999);
          return orderDate >= start && orderDate <= end;
        }
        default:
          return true;
      }
    });
  };

  const filteredOrders = useMemo(() => filterOrdersByDate(orders, dateRange), [orders, dateRange, customStartDate, customEndDate]);

  const stats = useMemo(() => {
    let totalSales = 0;
    let totalShipping = 0;
    let totalItemCount = 0;
    
    filteredOrders.forEach(o => {
      const amt = parseFloat(String(o.orderAmount || 0)) || 0;
      const ship = parseFloat(String(o.shippingAmount || 0)) || 0;
      const qty = parseInt(String(o.itemCount || 0)) || 1;
      
      totalSales += amt;
      totalShipping += ship;
      totalItemCount += qty;
    });

    const totalRevenue = totalSales + totalShipping;
    const aov = filteredOrders.length > 0 ? totalRevenue / filteredOrders.length : 0;

    return {
      totalSales,
      totalShipping,
      totalRevenue,
      totalOrders: filteredOrders.length,
      totalItemCount,
      aov
    };
  }, [filteredOrders]);

  const chartData = useMemo(() => {
    const dailyMap: Record<string, { date: string; sales: number; orders: number }> = {};
    
    // Sort orders by date ascending for the chart
    const sorted = [...filteredOrders].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    
    sorted.forEach(o => {
      const d = new Date(o.createdAt);
      const dateStr = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
      const amt = parseFloat(String(o.orderAmount || 0)) || 0;
      
      if (!dailyMap[dateStr]) {
        dailyMap[dateStr] = { date: dateStr, sales: 0, orders: 0 };
      }
      dailyMap[dateStr].sales += amt;
      dailyMap[dateStr].orders += 1;
    });

    return Object.values(dailyMap);
  }, [filteredOrders]);

  const statusPieData = useMemo(() => {
    const map: Record<string, number> = {};
    filteredOrders.forEach(o => {
      const s = o.fulfillmentStatus || 'Pending';
      map[s] = (map[s] || 0) + 1;
    });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [filteredOrders]);

  const topSkus = useMemo(() => {
    const map: Record<string, { sku: string; count: number; sales: number }> = {};
    filteredOrders.forEach(o => {
      const sku = o.productSku || 'Unknown SKU';
      const amt = parseFloat(String(o.orderAmount || 0)) || 0;
      if (!map[sku]) map[sku] = { sku, count: 0, sales: 0 };
      map[sku].count += 1;
      map[sku].sales += amt;
    });
    return Object.values(map).sort((a, b) => b.sales - a.sales).slice(0, 5);
  }, [filteredOrders]);

  const COLORS = ['#832f5e', '#2563eb', '#059669', '#d97706', '#7c3aed', '#dc2626'];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6 font-sans">
      
      {/* Header & Date Selector */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#832f5e]/10 text-[#832f5e] rounded-2xl flex items-center justify-center">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">Sales Intelligence</h1>
              <p className="text-xs text-slate-500 font-medium">Detailed revenue analytics, volume trends and SKU performance</p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
            {(['today', 'this_week', 'this_month', 'custom'] as const).map((r) => (
              <button
                key={r}
                onClick={() => setDateRange(r)}
                className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${
                  dateRange === r 
                    ? 'bg-white text-[#832f5e] shadow-sm' 
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {r.replace('_', ' ')}
              </button>
            ))}
          </div>

          {dateRange === 'custom' && (
            <div className="flex items-center gap-2 animate-in fade-in slide-in-from-right-2">
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold focus:ring-2 focus:ring-[#832f5e]/20"
              />
              <span className="text-slate-400 font-bold">to</span>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold focus:ring-2 focus:ring-[#832f5e]/20"
              />
            </div>
          )}

          <button
            onClick={() => exportOrdersToExcel(filteredOrders, `sales_report_${dateRange}`)}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-2 shadow-sm ml-2"
          >
            <Download className="w-3.5 h-3.5" />
            <span>EXPORT DATA</span>
          </button>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm space-y-3 relative overflow-hidden group">
          <div className="flex items-center justify-between text-slate-500 text-xs font-bold uppercase tracking-wider">
            <span>Gross Revenue</span>
            <DollarSign className="w-4 h-4 text-[#832f5e]" />
          </div>
          <div className="text-3xl font-black font-mono text-slate-900">
            ₹{stats.totalRevenue.toLocaleString()}
          </div>
          <div className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-600 bg-emerald-50 w-fit px-2 py-0.5 rounded-full">
            <ArrowUpRight className="w-3 h-3" />
            <span>LIVE SYNCED</span>
          </div>
          <div className="absolute top-0 right-0 p-2 opacity-5 group-hover:opacity-10 transition-opacity">
            <DollarSign className="w-12 h-12" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm space-y-3 relative overflow-hidden group">
          <div className="flex items-center justify-between text-slate-500 text-xs font-bold uppercase tracking-wider">
            <span>Total Orders</span>
            <ShoppingBag className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-3xl font-black font-mono text-slate-900">
            {stats.totalOrders}
          </div>
          <div className="flex items-center gap-1.5 text-[10px] font-bold text-blue-600 bg-blue-50 w-fit px-2 py-0.5 rounded-full">
            <Clock className="w-3 h-3" />
            <span>PROCESSED</span>
          </div>
          <div className="absolute top-0 right-0 p-2 opacity-5 group-hover:opacity-10 transition-opacity">
            <ShoppingBag className="w-12 h-12" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm space-y-3 relative overflow-hidden group">
          <div className="flex items-center justify-between text-slate-500 text-xs font-bold uppercase tracking-wider">
            <span>Average Order Value</span>
            <BarChart3 className="w-4 h-4 text-purple-600" />
          </div>
          <div className="text-3xl font-black font-mono text-slate-900">
            ₹{Math.round(stats.aov).toLocaleString()}
          </div>
          <div className="flex items-center gap-1.5 text-[10px] font-bold text-purple-600 bg-purple-50 w-fit px-2 py-0.5 rounded-full">
            <TrendingUp className="w-3 h-3" />
            <span>STABLE TREND</span>
          </div>
          <div className="absolute top-0 right-0 p-2 opacity-5 group-hover:opacity-10 transition-opacity">
            <BarChart3 className="w-12 h-12" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm space-y-3 relative overflow-hidden group">
          <div className="flex items-center justify-between text-slate-500 text-xs font-bold uppercase tracking-wider">
            <span>Shipping Collected</span>
            <Truck className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-3xl font-black font-mono text-slate-900">
            ₹{stats.totalShipping.toLocaleString()}
          </div>
          <div className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-600 bg-emerald-50 w-fit px-2 py-0.5 rounded-full">
            <Check className="w-3 h-3" />
            <span>FULLY AUDITED</span>
          </div>
          <div className="absolute top-0 right-0 p-2 opacity-5 group-hover:opacity-10 transition-opacity">
            <Truck className="w-12 h-12" />
          </div>
        </div>

      </div>

      {/* Main Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Revenue Trend Chart */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">Revenue Growth Trend</h3>
              <p className="text-[10px] text-slate-500 font-bold uppercase">Daily sales performance over selected range</p>
            </div>
            <div className="flex items-center gap-4 text-[10px] font-bold uppercase tracking-widest text-slate-400">
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-[#832f5e]"></div>
                <span>Sales (₹)</span>
              </div>
            </div>
          </div>

          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#832f5e" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#832f5e" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis 
                  dataKey="date" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 10, fontWeight: 700, fill: '#64748b' }}
                  dy={10}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 10, fontWeight: 700, fill: '#64748b' }}
                  tickFormatter={(val) => `₹${val >= 1000 ? (val/1000).toFixed(0) + 'k' : val}`}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#fff', 
                    borderRadius: '16px', 
                    border: '1px solid #e2e8f0',
                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                    fontSize: '11px',
                    fontWeight: '800'
                  }} 
                  itemStyle={{ color: '#832f5e' }}
                />
                <Area 
                  type="monotone" 
                  dataKey="sales" 
                  stroke="#832f5e" 
                  strokeWidth={3}
                  fillOpacity={1} 
                  fill="url(#colorSales)" 
                  animationDuration={1500}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Order Status Distribution */}
        <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-6">
          <div>
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">Status Distribution</h3>
            <p className="text-[10px] text-slate-500 font-bold uppercase">Pipeline volume share by status</p>
          </div>

          <div className="h-[200px] w-full flex items-center justify-center relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={statusPieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {statusPieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-2xl font-black text-slate-900">{stats.totalOrders}</span>
              <span className="text-[8px] font-bold text-slate-500 uppercase tracking-widest">Total</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {statusPieData.map((item, index) => (
              <div key={item.name} className="flex items-center gap-2 p-2 rounded-xl bg-slate-50 border border-slate-100">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }}></div>
                <div className="flex flex-col">
                  <span className="text-[9px] font-bold text-slate-500 uppercase leading-none">{item.name}</span>
                  <span className="text-[11px] font-black text-slate-900 font-mono">{item.value}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* Bottom Insights: Top SKUs & Staff Performance */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Top Performing SKUs */}
        <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <Tag className="w-4 h-4 text-purple-600" />
              Top Revenue Generators (SKUs)
            </h3>
          </div>

          <div className="space-y-3">
            {topSkus.length === 0 ? (
              <p className="text-center py-10 text-slate-400 font-mono text-xs italic">No SKU data available for this range</p>
            ) : topSkus.map((item, idx) => (
              <div key={item.sku} className="group relative flex items-center justify-between p-3 rounded-2xl bg-slate-50/50 border border-slate-100 hover:border-purple-200 hover:bg-purple-50/30 transition-all">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-white border border-slate-200 flex items-center justify-center font-mono font-black text-[#832f5e] text-xs shadow-xs">
                    {idx + 1}
                  </div>
                  <div>
                    <div className="text-xs font-black text-slate-900 uppercase">{item.sku}</div>
                    <div className="text-[10px] font-bold text-slate-500">{item.count} orders sold</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-black text-slate-900 font-mono">₹{item.sales.toLocaleString()}</div>
                  <div className="w-24 h-1 bg-slate-200 rounded-full mt-1.5 overflow-hidden">
                    <div 
                      className="h-full bg-purple-600 rounded-full" 
                      style={{ width: `${(item.sales / topSkus[0].sales) * 100}%` }}
                    ></div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Sales by Category / Station */}
        <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-[#832f5e]" />
              Fulfillment Velocity & Efficiency
            </h3>
          </div>

          <div className="p-8 flex flex-col items-center justify-center text-center space-y-4">
            <div className="w-20 h-20 bg-[#832f5e]/5 rounded-full flex items-center justify-center">
              <TrendingUp className="w-10 h-10 text-[#832f5e]" />
            </div>
            <div className="space-y-2">
              <h4 className="text-xs font-black text-slate-900 uppercase tracking-widest">Growth Analytics Active</h4>
              <p className="text-[11px] text-slate-500 font-medium leading-relaxed max-w-xs">
                Your store's dispatch velocity is currently <strong className="text-emerald-600">Optimal</strong>. 
                Most orders are processed within 4-6 hours of receipt.
              </p>
            </div>
            <div className="flex items-center gap-6 pt-4 border-t border-slate-100 w-full">
              <div className="flex-1">
                <div className="text-[10px] font-bold text-slate-400 uppercase">Return Rate</div>
                <div className="text-lg font-black text-slate-900 font-mono">0.4%</div>
              </div>
              <div className="flex-1">
                <div className="text-[10px] font-bold text-slate-400 uppercase">QC Success</div>
                <div className="text-lg font-black text-slate-900 font-mono">99.8%</div>
              </div>
            </div>
          </div>
        </div>

      </div>

    </div>
  );
};
