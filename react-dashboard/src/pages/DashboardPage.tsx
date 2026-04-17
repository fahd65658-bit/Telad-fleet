import { useEffect, useState } from 'react';
import api from '../api';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

interface Stats {
  vehicles: number; activeVehicles: number; drivers: number; employees: number;
  maintenance: number; appointments: number; accidents: number; violationsUnpaid: number;
  financialMonth: string; handoversToday: number; insuranceExpiring: number; inspectionExpired: number;
  efficiency: number; alerts: number;
}

const COLORS = ['#22c55e', '#f59e0b', '#ef4444', '#3b82f6'];

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    api.get('/dashboard').then(r => setStats(r.data)).catch(() => {});
    const t = setInterval(() => api.get('/dashboard').then(r => setStats(r.data)).catch(() => {}), 30_000);
    return () => clearInterval(t);
  }, []);

  if (!stats) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>جارٍ التحميل…</div>;

  const barData = [
    { name: 'صيانة', value: stats.maintenance },
    { name: 'مواعيد', value: stats.appointments },
    { name: 'مخالفات', value: stats.violationsUnpaid },
    { name: 'حوادث',  value: stats.accidents },
  ];

  const pieData = [
    { name: 'نشطة',  value: stats.activeVehicles },
    { name: 'أخرى',  value: Math.max(stats.vehicles - stats.activeVehicles, 0) },
  ];

  return (
    <div>
      <h2 style={{ marginBottom: 20, fontSize: 22, fontWeight: 700 }}>لوحة التحكم التنفيذية</h2>

      {/* KPI Row */}
      <div className="kpi-grid">
        <div className="kpi-card blue">
          <div className="kpi-icon">🚗</div>
          <div>
            <div className="kpi-label">إجمالي المركبات</div>
            <div className="kpi-value">{stats.vehicles}</div>
            <div className="kpi-sub">{stats.activeVehicles} نشطة</div>
          </div>
        </div>
        <div className="kpi-card green">
          <div className="kpi-icon">👤</div>
          <div>
            <div className="kpi-label">الموظفون</div>
            <div className="kpi-value">{stats.employees}</div>
            <div className="kpi-sub">{stats.drivers} سائق</div>
          </div>
        </div>
        <div className="kpi-card orange">
          <div className="kpi-icon">⚡</div>
          <div>
            <div className="kpi-label">كفاءة الأسطول</div>
            <div className="kpi-value">{stats.efficiency}%</div>
            <div className="kpi-sub">نسبة التشغيل</div>
          </div>
        </div>
        <div className="kpi-card red">
          <div className="kpi-icon">🚨</div>
          <div>
            <div className="kpi-label">تنبيهات حرجة</div>
            <div className="kpi-value">{stats.insuranceExpiring + stats.inspectionExpired}</div>
            <div className="kpi-sub">تحتاج إجراء</div>
          </div>
        </div>
        <div className="kpi-card blue" style={{ borderColor: '#22c55e' }}>
          <div className="kpi-icon">💰</div>
          <div>
            <div className="kpi-label">مصروفات الشهر</div>
            <div className="kpi-value" style={{ fontSize: 20 }}>{Number(stats.financialMonth).toLocaleString('ar')}</div>
            <div className="kpi-sub">ريال سعودي</div>
          </div>
        </div>
        <div className="kpi-card green">
          <div className="kpi-icon">🔄</div>
          <div>
            <div className="kpi-label">استلام/تسليم اليوم</div>
            <div className="kpi-value">{stats.handoversToday}</div>
            <div className="kpi-sub">عملية</div>
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="charts-grid">
        <div className="chart-card">
          <div className="chart-title">📊 ملخص العمليات</div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={barData} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
              <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 12 }} />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} allowDecimals={false} />
              <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }} />
              <Bar dataKey="value" fill="#3b82f6" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-card">
          <div className="chart-title">🚗 توزيع المركبات</div>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-card">
          <div className="chart-title">🛡️ التأمين والفحص</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>⚠️ تأمين على وشك الانتهاء</span>
              <span className="pill pill-orange">{stats.insuranceExpiring}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>🔴 فحص منتهي الصلاحية</span>
              <span className="pill pill-red">{stats.inspectionExpired}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
