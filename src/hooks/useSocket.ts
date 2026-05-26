import { useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

const SOCKET_URL = 'http://localhost:3001';

let globalSocket: Socket | null = null;

export function useSocket(handlers: Record<string, (data: unknown) => void>) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!globalSocket) {
      globalSocket = io(SOCKET_URL, {
        transports: ['websocket', 'polling'],
        reconnectionAttempts: 10,
        reconnectionDelay: 1000,
      });
    }

    const socket = globalSocket;

    const wrappedHandlers: Record<string, (data: unknown) => void> = {};
    for (const [event, handler] of Object.entries(handlers)) {
      wrappedHandlers[event] = (data: unknown) => {
        handlersRef.current[event]?.(data);
      };
      socket.on(event, wrappedHandlers[event]);
    }

    return () => {
      for (const [event, handler] of Object.entries(wrappedHandlers)) {
        socket.off(event, handler);
      }
    };
  }, []);

  const emit = useCallback((event: string, data?: unknown) => {
    globalSocket?.emit(event, data);
  }, []);

  return { emit };
}
