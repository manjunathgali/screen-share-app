"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SignalingServer = void 0;
const ws_1 = require("ws");
const uuid_1 = require("uuid");
const roomManager_1 = require("./roomManager");
const VALID_MESSAGE_TYPES = new Set([
    "create-room",
    "join-room",
    "offer",
    "answer",
    "ice-candidate",
    "end-session",
]);
class SignalingServer {
    constructor(config) {
        this.wss = null;
        this.connectedClients = new Map();
        this.config = config;
        this.roomManager = new roomManager_1.RoomManager(config);
    }
    start(port) {
        return new Promise((resolve, reject) => {
            this.wss = new ws_1.WebSocketServer({ port, host: "0.0.0.0" });
            this.wss.on("listening", () => {
                this.roomManager.startCleanupTimer();
                resolve();
            });
            this.wss.on("error", (err) => {
                reject(err);
            });
            this.wss.on("connection", (ws) => {
                const clientId = (0, uuid_1.v4)();
                const client = {
                    id: clientId,
                    ws,
                    roomId: null,
                    role: null,
                };
                this.connectedClients.set(clientId, client);
                console.log(`[CONNECT] Client ${clientId.slice(0, 8)} connected (total: ${this.connectedClients.size})`);
                this.sendToClient(clientId, { type: "welcome", clientId });
                ws.on("message", (raw) => {
                    const rawStr = raw.toString();
                    console.log(`[MSG] From ${clientId.slice(0, 8)}: ${rawStr}`);
                    this.handleClientMessage(clientId, rawStr);
                });
                ws.on("close", () => {
                    console.log(`[DISCONNECT] Client ${clientId.slice(0, 8)} disconnected`);
                    this.handleClientDisconnect(clientId);
                });
            });
        });
    }
    stop() {
        return new Promise((resolve) => {
            this.roomManager.stopCleanupTimer();
            if (this.wss) {
                this.wss.close(() => {
                    this.wss = null;
                    this.connectedClients.clear();
                    resolve();
                });
            }
            else {
                resolve();
            }
        });
    }
    handleClientMessage(clientId, raw) {
        const client = this.connectedClients.get(clientId);
        if (!client)
            return;
        let message;
        try {
            message = JSON.parse(raw);
        }
        catch {
            this.sendToClient(clientId, {
                type: "error",
                message: "Invalid JSON",
            });
            return;
        }
        if (!message ||
            typeof message !== "object" ||
            !VALID_MESSAGE_TYPES.has(message.type)) {
            this.sendToClient(clientId, {
                type: "error",
                message: "Invalid message type",
            });
            return;
        }
        switch (message.type) {
            case "create-room": {
                console.log(`[ROOM] Client ${clientId.slice(0, 8)} creating room: ${message.roomId}`);
                const result = this.roomManager.createRoom(message.roomId, clientId, client.ws);
                if (result.ok) {
                    client.roomId = message.roomId;
                    client.role = "host";
                    this.sendToClient(clientId, {
                        type: "room-created",
                        roomId: message.roomId,
                    });
                }
                else {
                    this.sendToClient(clientId, {
                        type: "error",
                        message: result.error,
                    });
                }
                break;
            }
            case "join-room": {
                console.log(`[ROOM] Client ${clientId.slice(0, 8)} joining room: ${message.roomId}`);
                console.log(`[ROOM] Active rooms: ${Array.from(this.roomManager.getRooms().keys()).join(', ') || 'none'}`);
                const result = this.roomManager.joinRoom(message.roomId, clientId, client.ws);
                if (result.ok) {
                    client.roomId = message.roomId;
                    client.role = "viewer";
                    this.sendToClient(clientId, {
                        type: "room-joined",
                        roomId: message.roomId,
                        hostId: result.room.hostId,
                    });
                    this.sendToClient(result.room.hostId, {
                        type: "peer-joined",
                        peerId: clientId,
                    });
                }
                else {
                    this.sendToClient(clientId, {
                        type: "error",
                        message: result.error,
                    });
                }
                break;
            }
            case "offer":
            case "answer": {
                this.sendToClient(message.targetId, {
                    type: message.type,
                    peerId: clientId,
                    sdp: message.sdp,
                });
                break;
            }
            case "ice-candidate": {
                this.sendToClient(message.targetId, {
                    type: "ice-candidate",
                    peerId: clientId,
                    candidate: message.candidate,
                    sdpMid: message.sdpMid,
                    sdpMLineIndex: message.sdpMLineIndex,
                });
                break;
            }
            case "end-session": {
                if (client.role === "host" && client.roomId) {
                    const room = this.roomManager.getRoom(client.roomId);
                    if (room) {
                        for (const [viewerId] of room.viewers) {
                            this.sendToClient(viewerId, { type: "session-ended" });
                        }
                        this.roomManager.deleteRoom(client.roomId);
                    }
                }
                break;
            }
        }
    }
    handleClientDisconnect(clientId) {
        const client = this.connectedClients.get(clientId);
        if (!client || !client.roomId) {
            this.connectedClients.delete(clientId);
            return;
        }
        const room = this.roomManager.getRoom(client.roomId);
        if (!room) {
            this.connectedClients.delete(clientId);
            return;
        }
        if (client.role === "host") {
            for (const [viewerId] of room.viewers) {
                this.sendToClient(viewerId, { type: "session-ended" });
            }
            this.roomManager.deleteRoom(client.roomId);
        }
        else if (client.role === "viewer") {
            this.roomManager.removeViewer(client.roomId, clientId);
            this.sendToClient(room.hostId, {
                type: "peer-left",
                peerId: clientId,
            });
        }
        this.connectedClients.delete(clientId);
    }
    sendToClient(clientId, message) {
        const client = this.connectedClients.get(clientId);
        if (client && client.ws.readyState === ws_1.WebSocket.OPEN) {
            client.ws.send(JSON.stringify(message));
        }
    }
    getConnectedClients() {
        return this.connectedClients;
    }
    getRoomManager() {
        return this.roomManager;
    }
}
exports.SignalingServer = SignalingServer;
//# sourceMappingURL=server.js.map