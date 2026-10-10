"""Real-time WebSocket manager for Eyes Only.

Broadcasts live updates (document ingestion status changes, new uploads,
access request changes, security test updates) to connected clients
in the relevant tenant so the UI updates instantly without manual browser refresh.
"""
import asyncio
import json
import logging
from typing import Any
from fastapi import WebSocket, WebSocketDisconnect

logger = logging.getLogger(__name__)


class ConnectionManager:
    def __init__(self):
        # tenant_id -> set of active WebSockets
        self.active_connections: dict[str, set[WebSocket]] = {}
        # socket -> tenant_id
        self.socket_tenant: dict[WebSocket, str] = {}

    async def connect(self, websocket: WebSocket, tenant_id: str):
        await websocket.accept()
        if tenant_id not in self.active_connections:
            self.active_connections[tenant_id] = set()
        self.active_connections[tenant_id].add(websocket)
        self.socket_tenant[websocket] = tenant_id
        logger.info("WebSocket connected for tenant %s. Active connections: %d",
                    tenant_id, len(self.active_connections[tenant_id]))

    def disconnect(self, websocket: WebSocket):
        tenant_id = self.socket_tenant.pop(websocket, None)
        if tenant_id and tenant_id in self.active_connections:
            self.active_connections[tenant_id].discard(websocket)
            if not self.active_connections[tenant_id]:
                del self.active_connections[tenant_id]
        logger.info("WebSocket disconnected. Tenant: %s", tenant_id)

    async def broadcast_tenant(self, tenant_id: str, message: dict[str, Any]):
        """Broadcasts a JSON payload to all active WebSockets belonging to the specified tenant."""
        sockets = self.active_connections.get(tenant_id, set()).copy()
        if not sockets:
            return
        payload = json.dumps(message)
        dead = []
        for ws in sockets:
            try:
                await ws.send_text(payload)
            except Exception as e:
                logger.debug("Failed to send WebSocket message: %s", e)
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)

    def broadcast_sync(self, tenant_id: str, message: dict[str, Any]):
        """Safe synchronous wrapper to broadcast from background tasks or synchronous endpoints."""
        try:
            try:
                loop = asyncio.get_running_loop()
            except RuntimeError:
                loop = None

            if loop and loop.is_running():
                asyncio.run_coroutine_threadsafe(self.broadcast_tenant(tenant_id, message), loop)
            else:
                new_loop = asyncio.new_event_loop()
                new_loop.run_until_complete(self.broadcast_tenant(tenant_id, message))
                new_loop.close()
        except Exception as e:
            logger.debug("broadcast_sync exception: %s", e)


manager = ConnectionManager()
