import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { io, Socket } from 'socket.io-client';

interface GpsPos { vehicleId: string; lat: number; lng: number; speed: number; heading: number; }
interface SocketCtx { socket: Socket | null; gpsPositions: Map<string, GpsPos>; connected: boolean; }

const Ctx = createContext<SocketCtx>({ socket: null, gpsPositions: new Map(), connected: false });

export function SocketProvider({ children }: { children: ReactNode }) {
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [gpsPositions, setGpsPositions] = useState<Map<string, GpsPos>>(new Map());

  useEffect(() => {
    const token = localStorage.getItem('telad_token');
    if (!token) return;

    const s = io('/', { auth: { token }, transports: ['websocket', 'polling'] });
    socketRef.current = s;

    s.on('connect',    () => setConnected(true));
    s.on('disconnect', () => setConnected(false));

    s.on('gps:update', (data: GpsPos) => {
      setGpsPositions(prev => { const m = new Map(prev); m.set(data.vehicleId, data); return m; });
    });

    s.on('gps:batch', (batch: GpsPos[]) => {
      setGpsPositions(prev => {
        const m = new Map(prev);
        for (const p of batch) m.set(p.vehicleId, p);
        return m;
      });
    });

    return () => { s.disconnect(); };
  }, []);

  return <Ctx.Provider value={{ socket: socketRef.current, gpsPositions, connected }}>{children}</Ctx.Provider>;
}

export const useSocket = () => useContext(Ctx);
