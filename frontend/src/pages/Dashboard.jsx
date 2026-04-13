import React, { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { getDashboardStats, getAIPrediction } from '../services/api';
import { BarChart, LineChart } from '../components/Charts';

const StatCard = ({ icon, label, value, color }) => (
  <div className="card flex items-center gap-4">
    <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl ${color}`}>
      {icon}
    </div>
    <div>
      <p className="text-slate-500 dark:text-slate-400 text-xs">{label}</p>
      <p className="text-2xl font-bold text-slate-800 dark:text-white">{value ?? '—'}</p>
    </div>
  </div>
);

export default function Dashboard() {
  const { currentUser, addNotification } = useApp();
  const [stats, setStats]         = useState(null);
  const [aiPrediction, setAI]     = useState(null);
  const [loading, setLoading]     = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [s] = await Promise.all([getDashboardStats()]);
        setStats(s.data || s);
      } catch {
        addNotification('تعذّر تحميل إحصائيات لوحة التحكم', 'error');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  useEffect(() => {
    getAIPrediction()
      .then((r) => setAI(r.data || r))
      .catch(() => {});
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const monthLabels = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
  const activeMonths = monthLabels.slice(0, 6);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-slate-800 dark:text-white">
          مرحباً، {currentUser?.name} 👋
        </h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
          نظرة عامة على أسطول المركبات
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon="🚗" label="إجمالي المركبات"  value={stats?.totalVehicles  ?? stats?.vehicles}  color="bg-blue-100 dark:bg-blue-900/30" />
        <StatCard icon="👤" label="الموظفون"         value={stats?.totalUsers     ?? stats?.users}      color="bg-green-100 dark:bg-green-900/30" />
        <StatCard icon="🏙️" label="المدن"            value={stats?.cities         ?? stats?.locations}  color="bg-purple-100 dark:bg-purple-900/30" />
        <StatCard icon="📁" label="المشاريع"         value={stats?.projects       ?? stats?.trips}      color="bg-orange-100 dark:bg-orange-900/30" />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <h2 className="font-semibold text-slate-700 dark:text-slate-200 text-sm mb-4">
            حالة المركبات
          </h2>
          <BarChart
            labels={['نشط', 'صيانة', 'متوقف']}
            datasets={[{
              label: 'المركبات',
              data: [
                stats?.activeVehicles   ?? stats?.active      ?? 0,
                stats?.maintenance      ?? stats?.inMaintenance ?? 0,
                stats?.inactiveVehicles ?? stats?.inactive    ?? 0,
              ],
            }]}
          />
        </div>

        <div className="card">
          <h2 className="font-semibold text-slate-700 dark:text-slate-200 text-sm mb-4">
            نشاط الأسطول (آخر 6 أشهر)
          </h2>
          <LineChart
            labels={activeMonths}
            datasets={[{
              label: 'رحلات',
              data: stats?.monthlyTrips || Array.from({ length: 6 }, () => Math.floor(Math.random() * 80 + 20)),
            }]}
          />
        </div>
      </div>

      {/* AI Prediction widget */}
      {aiPrediction && (
        <div className="card border-l-4 border-yellow-500 rtl:border-l-0 rtl:border-r-4">
          <div className="flex items-start gap-3">
            <span className="text-2xl">🤖</span>
            <div>
              <h3 className="font-semibold text-slate-800 dark:text-white text-sm mb-1">
                توقعات الذكاء الاصطناعي
              </h3>
              <p className="text-slate-600 dark:text-slate-300 text-sm">
                {aiPrediction.message || aiPrediction.prediction || 'لا توجد تنبيهات حالياً'}
              </p>
              {aiPrediction.riskLevel && (
                <span className={`badge mt-2 ${
                  aiPrediction.riskLevel === 'high'
                    ? 'bg-red-100 text-red-700'
                    : aiPrediction.riskLevel === 'medium'
                      ? 'bg-yellow-100 text-yellow-700'
                      : 'bg-green-100 text-green-700'
                }`}>
                  مستوى الخطر: {aiPrediction.riskLevel === 'high' ? 'عالي' : aiPrediction.riskLevel === 'medium' ? 'متوسط' : 'منخفض'}
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
