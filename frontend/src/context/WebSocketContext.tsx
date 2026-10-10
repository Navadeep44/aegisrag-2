import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { getToken } from "../lib/api";
import { useAuth } from "./AuthContext";

export interface WebSocketEvent {
  type: string;
  [key: string]: any;
}

type EventListener = (event: WebSocketEvent) => void;

interface WebSocketContextType {
  isConnected: boolean;
  lastEvent: WebSocketEvent | null;
  subscribe: (eventType: string, listener: EventListener) => () => void;
  send: (data: string | object) => void;
}

const WebSocketContext = createContext<WebSocketContextType>({
  isConnected: false,
  lastEvent: null,
  subscribe: () => () => {},
  send: () => {},
});

export function WebSocketProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [isConnected, setIsConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<WebSocketEvent | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const listenersRef = useRef<Map<string, Set<EventListener>>>(new Map());
  const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null);

  const subscribe = useCallback((eventType: string, listener: EventListener) => {
    if (!listenersRef.current.has(eventType)) {
      listenersRef.current.set(eventType, new Set());
    }
    listenersRef.current.get(eventType)!.add(listener);

    return () => {
      const listeners = listenersRef.current.get(eventType);
      if (listeners) {
        listeners.delete(listener);
        if (listeners.size === 0) {
          listenersRef.current.delete(eventType);
        }
      }
    };
  }, []);

  const send = useCallback((data: string | object) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      const payload = typeof data === "string" ? data : JSON.stringify(data);
      wsRef.current.send(payload);
    }
  }, []);

  useEffect(() => {
    const token = getToken();
    if (!user || !token) {
      if (wsRef.current) {
        const ws = wsRef.current;
        ws.onopen = null;
        ws.onmessage = null;
        ws.onerror = null;
        ws.onclose = null;
        if (ws.readyState === WebSocket.OPEN) {
          ws.close(1000, "Logout");
        } else if (ws.readyState === WebSocket.CONNECTING) {
          ws.onopen = () => {
            try {
              ws.close(1000, "Logout");
            } catch {}
          };
        }
        wsRef.current = null;
      }
      setIsConnected(false);
      return;
    }

    let isUnmounted = false;

    function connect() {
      if (isUnmounted) return;
      const t = getToken();
      if (!t) return;

      let protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      let host = window.location.host;
      const apiBase = import.meta.env.VITE_API_BASE_URL;
      if (apiBase) {
        try {
          const u = new URL(apiBase);
          protocol = u.protocol === "https:" ? "wss:" : "ws:";
          host = u.host;
        } catch { /* use window.location */ }
      }
      const wsUrl = `${protocol}//${host}/api/ws?token=${encodeURIComponent(t)}`;

      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          if (isUnmounted) return;
          setIsConnected(true);
        };

        ws.onmessage = (event) => {
          if (isUnmounted) return;
          try {
            const data: WebSocketEvent = JSON.parse(event.data);
            setLastEvent(data);

            // Dispatch to specific event listeners
            if (data.type && listenersRef.current.has(data.type)) {
              listenersRef.current.get(data.type)!.forEach((cb) => {
                try {
                  cb(data);
                } catch (err) {
                  console.error("WebSocket listener error:", err);
                }
              });
            }

            // Also dispatch to wildcard '*' listeners
            if (listenersRef.current.has("*")) {
              listenersRef.current.get("*")!.forEach((cb) => {
                try {
                  cb(data);
                } catch (err) {
                  console.error("Wildcard WebSocket listener error:", err);
                }
              });
            }
          } catch {
            // Non-JSON message
          }
        };

        ws.onclose = () => {
          if (isUnmounted) return;
          setIsConnected(false);
          // Try reconnecting after 3 seconds
          if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
          reconnectTimerRef.current = setTimeout(connect, 3000);
        };

        ws.onerror = () => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.close();
          }
        };
      } catch {
        if (!isUnmounted) {
          reconnectTimerRef.current = setTimeout(connect, 4000);
        }
      }
    }

    connect();

    // Heartbeat ping every 25 seconds
    const pingInterval = setInterval(() => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send("ping");
      }
    }, 25000);

    return () => {
      isUnmounted = true;
      clearInterval(pingInterval);
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (wsRef.current) {
        const ws = wsRef.current;
        ws.onopen = null;
        ws.onmessage = null;
        ws.onerror = null;
        ws.onclose = null;
        if (ws.readyState === WebSocket.OPEN) {
          ws.close(1000, "Unmounted");
        } else if (ws.readyState === WebSocket.CONNECTING) {
          ws.onopen = () => {
            try {
              ws.close(1000, "Unmounted");
            } catch {}
          };
        }
        wsRef.current = null;
      }
      setIsConnected(false);
    };
  }, [user]);

  return (
    <WebSocketContext.Provider value={{ isConnected, lastEvent, subscribe, send }}>
      {children}
    </WebSocketContext.Provider>
  );
}

export function useWebSocket() {
  return useContext(WebSocketContext);
}

export function useWebSocketEvent(eventType: string, callback: EventListener) {
  const { subscribe } = useWebSocket();
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    return subscribe(eventType, (e) => {
      callbackRef.current(e);
    });
  }, [eventType, subscribe]);
}
