"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RoomManager = void 0;
exports.isValidRoomId = isValidRoomId;
exports.generateRoomId = generateRoomId;
const ROOM_ID_PATTERN = /^[A-Za-z0-9]{6}$/;
const ALPHANUMERIC_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
function isValidRoomId(roomId) {
    return ROOM_ID_PATTERN.test(roomId);
}
function generateRoomId() {
    let id = "";
    for (let i = 0; i < 6; i++) {
        id += ALPHANUMERIC_CHARS.charAt(Math.floor(Math.random() * ALPHANUMERIC_CHARS.length));
    }
    return id;
}
class RoomManager {
    constructor(config) {
        this.rooms = new Map();
        this.cleanupTimer = null;
        this.config = config;
    }
    startCleanupTimer() {
        if (this.cleanupTimer)
            return;
        this.cleanupTimer = setInterval(() => {
            this.cleanupIdleRooms();
        }, this.config.roomTimeoutMs);
    }
    stopCleanupTimer() {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = null;
        }
    }
    createRoom(roomId, hostId, hostWs) {
        if (!isValidRoomId(roomId)) {
            return { ok: false, error: "Invalid room ID format" };
        }
        if (this.rooms.has(roomId)) {
            return { ok: false, error: "Room already exists" };
        }
        if (this.rooms.size >= this.config.maxRoomsPerServer) {
            return { ok: false, error: "Server room limit reached" };
        }
        const room = {
            roomId,
            hostId,
            hostWs,
            viewers: new Map(),
            createdAt: Date.now(),
            maxViewers: this.config.maxViewersPerRoom,
        };
        this.rooms.set(roomId, room);
        return { ok: true, room };
    }
    joinRoom(roomId, viewerId, viewerWs) {
        const room = this.rooms.get(roomId);
        if (!room) {
            return { ok: false, error: "Room not found" };
        }
        if (room.viewers.size >= room.maxViewers) {
            return { ok: false, error: "Room is full" };
        }
        room.viewers.set(viewerId, viewerWs);
        return { ok: true, room };
    }
    removeViewer(roomId, viewerId) {
        const room = this.rooms.get(roomId);
        if (!room)
            return false;
        return room.viewers.delete(viewerId);
    }
    deleteRoom(roomId) {
        return this.rooms.delete(roomId);
    }
    getRoom(roomId) {
        return this.rooms.get(roomId);
    }
    getRooms() {
        return this.rooms;
    }
    getClientCount() {
        let count = 0;
        for (const room of this.rooms.values()) {
            count += 1 + room.viewers.size; // host + viewers
        }
        return count;
    }
    cleanupIdleRooms() {
        const now = Date.now();
        for (const [roomId, room] of this.rooms) {
            if (now - room.createdAt >= this.config.roomTimeoutMs) {
                // Notify viewers before deleting
                for (const [, viewerWs] of room.viewers) {
                    try {
                        viewerWs.send(JSON.stringify({ type: "session-ended" }));
                    }
                    catch {
                        // viewer may already be disconnected
                    }
                }
                this.rooms.delete(roomId);
            }
        }
    }
}
exports.RoomManager = RoomManager;
//# sourceMappingURL=roomManager.js.map