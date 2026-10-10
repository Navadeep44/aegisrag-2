"""Pushes small change notices (document added, access changed, request decided)
to the browser over WebSocket so open pages refresh without polling.

Messages carry ids and event types only, never document text, and are sent
only to sockets of the same tenant.
"""
import asyncio
import json
import logging
from typing import Any
from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ConnectionManager:
    def __init__(self):
        # tenant_id -> set of active WebSockets
        self.active_connections: dict[str, set[WebSocket]] = {}
        # socket -> tenant_id
        self.socket_tenant: dict[WebSocket, str] = {}
        # The server's event loop. Sockets belong to it, so sends from worker
        # threads (sync endpoints) must be scheduled onto it.
        self.loop: asyncio.AbstractEventLoop | None = None

    async def connect(self, websocket: WebSocket, tenant_id: str):
        self.loop = asyncio.get_running_loop()
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

    def broadcast_sync(self, tenant_id: str, message: dict[str, Any]) -> None:
        """Broadcast from synchronous code. Best effort: a notice that cannot be
        delivered is dropped, it never fails the request that triggered it."""
        if self.loop is None or self.loop.is_closed() or tenant_id not in self.active_connections:
            return
        try:
            asyncio.run_coroutine_threadsafe(self.broadcast_tenant(tenant_id, message), self.loop)
        except RuntimeError as e:
            logger.debug("broadcast_sync skipped: %s", e)


manager = ConnectionManager()
