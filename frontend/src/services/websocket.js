'use strict';

import { io } from 'socket.io-client';

const WS_URL =
  import.meta.env.VITE_WS_URL ||
  (import.meta.env.DEV ? 'http://localhost:5000' : '');

let socket = null;

export const connectWS = (token) => {
  if (socket?.connected) return socket;

  socket = io(WS_URL, {
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnectionAttempts: 5,
    reconnectionDelay: 2000,
  });

  socket.on('connect', () => {
    console.info('[WS] متصل بالخادم');
  });

  socket.on('disconnect', (reason) => {
    console.warn('[WS] انقطع الاتصال:', reason);
  });

  socket.on('connect_error', (err) => {
    console.error('[WS] خطأ في الاتصال:', err.message);
  });

  return socket;
};

export const disconnectWS = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};

export const onGPSUpdate = (callback) => {
  if (!socket) return;
  socket.on('gps:update', callback);
  return () => socket?.off('gps:update', callback);
};

export const emitGPS = (data) => {
  if (socket?.connected) {
    socket.emit('gps:send', data);
  }
};
