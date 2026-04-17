import { useEffect, useState } from 'react';
import api from '../api';

interface Vehicle {
  id: string; name: string; plate: string; city: string; driver: string;
  status: string; fuelLevel: number; km: number;
  insurance?: { status: string; expiry: string };
  inspection?: { status: string; expiry: string };
}

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  active:      { label: 'نشطة',      cls: 'pill-green'  },
  maintenance: { label: 'صيانة',     cls: 'pill-red'    },
  charging:    { label: 'شحن',       cls: 'pill-orange' },
};

export default function VehiclesPage() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [search,   setSearch]   = useState('');

  const load = () => {
    setLoading(true);
    api.get('/vehicles').then(r => { setVehicles(r.data); setLoading(false); }).catch(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const filtered = vehicles.filter(v =>
    [v.name, v.plate, v.city, v.driver].some(f => f?.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700 }}>المركبات</h2>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="بحث…"
          style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', width: 200 }}
        />
      </div>

      <div className="tbl-wrap">
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>جارٍ التحميل…</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>المركبة</th><th>اللوحة</th><th>المدينة</th><th>السائق</th>
                <th>الكيلومتراج</th><th>الوقود</th><th>الحالة</th>
                <th>التأمين</th><th>الفحص</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 30 }}>لا توجد نتائج</td></tr>
              ) : filtered.map(v => {
                const st = STATUS_MAP[v.status] || { label: v.status, cls: 'pill-gray' };
                const ins = v.insurance?.status === 'expiring' ? 'pill-orange' : v.insurance?.status === 'expired' ? 'pill-red' : 'pill-green';
                const insp = v.inspection?.status === 'منتهي' ? 'pill-red' : 'pill-green';
                return (
                  <tr key={v.id}>
                    <td style={{ fontWeight: 600 }}>{v.name}</td>
                    <td style={{ fontFamily: 'monospace' }}>{v.plate}</td>
                    <td>{v.city}</td>
                    <td>{v.driver}</td>
                    <td>{(v.km || 0).toLocaleString('ar')} كم</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ height: 6, width: 60, background: 'var(--surface-2)', borderRadius: 4, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${v.fuelLevel || 0}%`, background: v.fuelLevel < 20 ? 'var(--red)' : 'var(--green)', borderRadius: 4 }} />
                        </div>
                        <span style={{ fontSize: 11 }}>{v.fuelLevel}%</span>
                      </div>
                    </td>
                    <td><span className={`pill ${st.cls}`}>{st.label}</span></td>
                    <td><span className={`pill ${ins}`}>{v.insurance?.expiry || '—'}</span></td>
                    <td><span className={`pill ${insp}`}>{v.inspection?.status || '—'}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
