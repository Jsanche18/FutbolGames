import { io } from 'socket.io-client';

const rawUrl = process.env.NEXT_PUBLIC_SOCKET_URL || process.env.NEXT_PUBLIC_API_BASE_URL || '';
const baseUrl = rawUrl.replace(/\/$/, '');

export const socket = io(baseUrl, {
  autoConnect: false,
  withCredentials: true,
  transports: ['websocket', 'polling'],
  path: '/socket.io',
});
