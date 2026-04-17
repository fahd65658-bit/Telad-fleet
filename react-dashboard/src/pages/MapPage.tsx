import { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { useSocket } from '../context/SocketContext';
import 'leaflet/dist/leaflet.css';

// Fix Leaflet default icon
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({ iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png', shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png' });

function makeIcon(status: string) {
  const color = status === 'active' ? '#22c55e' : status === 'maintenance' ? '#ef4444' : '#f59e0b';
  return L.divIcon({
    className: '',
    html: `<div style="background:${color};width:14px;height:14px;border-radius:50%;border:2px solid white;box-shadow:0 0 6px rgba(0,0,0,.5)"></div>`,
    iconSize: [14, 14], iconAnchor: [7, 7],
  });
}

function LiveMarkers() {
  const { gpsPositions } = useSocket();
  const map = useMap();
  const markersRef = useRef<Map<string, L.Marker>>(new Map());

  useEffect(() => {
    for (const [id, pos] of gpsPositions) {
      if (markersRef.current.has(id)) {
        markersRef.current.get(id)!.setLatLng([pos.lat, pos.lng]);
      } else {
        const m = L.marker([pos.lat, pos.lng], { icon: makeIcon('active') })
          .addTo(map)
          .bindPopup(`<strong>${id}</strong><br>السرعة: ${Math.round(pos.speed || 0)} كم/س`);
        markersRef.current.set(id, m);
      }
    }
  }, [gpsPositions, map]);

  return null;
}

export default function MapPage() {
  const { connected } = useSocket();

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700 }}>خريطة الأسطول المباشرة</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div className="live-dot" style={{ background: connected ? 'var(--green)' : 'var(--text-muted)' }} />
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{connected ? 'بث مباشر' : 'غير متصل'}</span>
        </div>
      </div>

      <MapContainer center={[24.68, 46.72]} zoom={5} style={{ height: '75vh', borderRadius: 10, border: '1px solid var(--border)' }}>
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="© OpenStreetMap"
        />
        <LiveMarkers />
      </MapContainer>
    </div>
  );
}
