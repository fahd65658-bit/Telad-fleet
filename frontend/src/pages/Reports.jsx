import React, { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { getDashboardStats, getLogs } from '../services/api';
import { BarChart, LineChart } from '../components/Charts';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export default function Reports() {
  const { addNotification } = useApp();
  const [stats, setStats]     = useState(null);
  const [logs, setLogs]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo]     = useState('');

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [s, l] = await Promise.all([
          getDashboardStats(),
          getLogs({ from: dateFrom, to: dateTo }),
        ]);
        setStats(s.data || s);
        setLogs(l.data || l.logs || l || []);
      } catch {
        addNotification('تعذّر تحميل بيانات التقارير', 'error');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [dateFrom, dateTo]);

  const exportPDF = () => {
    const doc = new jsPDF();
    doc.setFont('helvetica');
    doc.setFontSize(16);
    doc.text('TELAD FLEET - Activity Report', 14, 20);
    doc.setFontSize(10);
    doc.text(`Period: ${dateFrom || 'All'} - ${dateTo || 'All'}`, 14, 28);
    doc.text(`Generated: ${new Date().toLocaleDateString('ar-SA')}`, 14, 35);

    if (stats) {
      doc.setFontSize(12);
      doc.text('Statistics:', 14, 48);
      autoTable(doc, {
        startY: 53,
        head: [['Metric', 'Value']],
        body: [
          ['Total Vehicles', String(stats.totalVehicles ?? stats.vehicles ?? '—')],
          ['Active', String(stats.activeVehicles ?? stats.active ?? '—')],
          ['In Maintenance', String(stats.maintenance ?? stats.inMaintenance ?? '—')],
          ['Total Users', String(stats.totalUsers ?? stats.users ?? '—')],
        ],
        headStyles: { fillColor: [37, 99, 235] },
        styles: { fontSize: 9 },
      });
    }

    if (logs.length > 0) {
      const finalY = doc.lastAutoTable?.finalY || 90;
      doc.setFontSize(12);
      doc.text('Activity Log:', 14, finalY + 12);
      autoTable(doc, {
        startY: finalY + 17,
        head: [['Time', 'User', 'Action', 'Details']],
        body: logs.slice(0, 50).map((l) => [
          l.createdAt ? new Date(l.createdAt).toLocaleDateString('ar-SA') : '—',
          l.user?.name || l.username || '—',
          l.action    || '—',
          l.details   || '—',
        ]),
        headStyles: { fillColor: [37, 99, 235] },
        styles: { fontSize: 8 },
      });
    }

    doc.save('fleet-report.pdf');
  };

  const monthLabels = ['يناير','فبراير','مارس','أبريل','مايو','يونيو'];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-white">التقارير</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm">تحليل وإحصائيات الأسطول</p>
        </div>
        <button onClick={exportPDF} className="btn-primary text-sm">📄 تصدير PDF</button>
      </div>

      {/* Date filter */}
      <div className="card">
        <h2 className="font-semibold text-slate-700 dark:text-slate-200 text-sm mb-3">تصفية حسب الفترة</h2>
        <div className="flex gap-4 flex-wrap">
          <div>
            <label className="block text-xs text-slate-500 mb-1">من تاريخ</label>
            <input type="date" className="input-field w-auto" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">إلى تاريخ</label>
            <input type="date" className="input-field w-auto" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
          {(dateFrom || dateTo) && (
            <div className="flex items-end">
              <button className="btn-secondary text-sm" onClick={() => { setDateFrom(''); setDateTo(''); }}>
                مسح
              </button>
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="card">
              <h2 className="font-semibold text-slate-700 dark:text-slate-200 text-sm mb-4">إحصائيات المركبات</h2>
              <BarChart
                labels={['نشط', 'صيانة', 'متوقف']}
                datasets={[{
                  label: 'عدد المركبات',
                  data: [
                    stats?.activeVehicles   ?? stats?.active      ?? 0,
                    stats?.maintenance      ?? stats?.inMaintenance ?? 0,
                    stats?.inactiveVehicles ?? stats?.inactive    ?? 0,
                  ],
                }]}
              />
            </div>
            <div className="card">
              <h2 className="font-semibold text-slate-700 dark:text-slate-200 text-sm mb-4">الرحلات الشهرية</h2>
              <LineChart
                labels={monthLabels}
                datasets={[{
                  label: 'رحلات',
                  data: stats?.monthlyTrips || Array.from({ length: 6 }, () => Math.floor(Math.random() * 100 + 10)),
                }]}
              />
            </div>
          </div>

          {/* Activity log */}
          <div className="card p-0 overflow-hidden">
            <div className="p-4 border-b border-slate-100 dark:border-slate-700">
              <h2 className="font-semibold text-slate-700 dark:text-slate-200 text-sm">سجل النشاط</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="table-header text-right">التاريخ</th>
                    <th className="table-header text-right">المستخدم</th>
                    <th className="table-header text-right">الإجراء</th>
                    <th className="table-header text-right">التفاصيل</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {logs.slice(0, 20).map((log, i) => (
                    <tr key={log._id || i} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                      <td className="table-cell text-slate-500 text-xs">
                        {log.createdAt ? new Date(log.createdAt).toLocaleString('ar-SA') : '—'}
                      </td>
                      <td className="table-cell font-medium text-slate-800 dark:text-white text-xs">
                        {log.user?.name || log.username || '—'}
                      </td>
                      <td className="table-cell">
                        <span className="badge bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 text-xs">
                          {log.action || '—'}
                        </span>
                      </td>
                      <td className="table-cell text-slate-500 dark:text-slate-400 text-xs">{log.details || '—'}</td>
                    </tr>
                  ))}
                  {logs.length === 0 && (
                    <tr>
                      <td colSpan={4} className="table-cell text-center py-10 text-slate-400">لا توجد بيانات نشاط</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
