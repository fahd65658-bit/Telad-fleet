import React, { useEffect, useRef } from 'react';

// Leaflet must be imported client-side only
export default function Map({ vehicles = [], center = [24.7136, 46.6753], zoom = 6 }) {
  const containerRef = useRef(null);
  const mapRef       = useRef(null);
  const markersRef   = useRef({});

  useEffect(() => {
    let L;
    let isMounted = true;

    const initMap = async () => {
      // Dynamic import to avoid SSR issues
      L = (await import('leaflet')).default;
      await import('leaflet/dist/leaflet.css');

      if (!isMounted || !containerRef.current || mapRef.current) return;

      // Fix default icon paths
      delete L.Icon.Default.prototype._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });

      mapRef.current = L.map(containerRef.current).setView(center, zoom);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(mapRef.current);
    };

    initMap();

    return () => {
      isMounted = false;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markersRef.current = {};
      }
    };
  }, []);

  // Update markers when vehicles change
  useEffect(() => {
    if (!mapRef.current) return;

    const updateMarkers = async () => {
      const L = (await import('leaflet')).default;

      const existing = new Set(Object.keys(markersRef.current));

      vehicles.forEach((v) => {
        const lat = v.lat ?? v.latitude ?? v.gps?.lat;
        const lng = v.lng ?? v.longitude ?? v.gps?.lng;
        if (!lat || !lng) return;

        const id = String(v._id || v.id || v.plate);
        const popup = `<div dir="rtl"><strong>${v.plate || v.plateNumber || '—'}</strong><br/>${v.driver || ''}</div>`;

        if (markersRef.current[id]) {
          markersRef.current[id].setLatLng([lat, lng]).setPopupContent(popup);
        } else {
          markersRef.current[id] = L.marker([lat, lng])
            .addTo(mapRef.current)
            .bindPopup(popup);
        }
        existing.delete(id);
      });

      // Remove stale markers
      existing.forEach((id) => {
        markersRef.current[id]?.remove();
        delete markersRef.current[id];
      });
    };

    updateMarkers();
  }, [vehicles]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full rounded-xl overflow-hidden"
      style={{ minHeight: '400px' }}
    />
  );
}
