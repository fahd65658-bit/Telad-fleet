
import { useEffect, useState } from 'react';
import io from 'socket.io-client';

const socket = io('https://api.fna.sa');

export default function App() {
  const [gps, setGps] = useState([]);

  useEffect(() => {
    socket.on('gps-stream', (data) => {
      setGps(prev => [...prev, data]);
    });
  }, []);

  return (
    <div>
      <h1>🏢 FNA Admin Dashboard</h1>
      <h3>🗺️ Live GPS</h3>
      {gps.map((g, i) => (
        <div key={i}>
          🚗 {g.vehicleId} - {g.lat}, {g.lng}
        </div>
      ))}
    </div>
  );
}
