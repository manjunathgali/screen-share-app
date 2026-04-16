import type { WebSocket } from "ws";
import type { RoomState, ServerConfig } from "./types";

const ROOM_ID_PATTERN = /^[0-9]{6}$/;
const ALPHANUMERIC_CHARS =
  "0123456789";

export function isValidRoomId(roomId: string): boolean {
  return ROOM_ID_PATTERN.test(roomId);
}

export function generateRoomId(): string {
  let id = "";
  for (let i = 0; i < 6; i++) {
    id += ALPHANUMERIC_CHARS.charAt(
      Math.floor(Math.random() * ALPHANUMERIC_CHARS.length)
    );
  }
  return id;
}

export type CreateRoomResult =
  | { ok: true; room: RoomState }
  | { ok: false; error: string };

export type JoinRoomResult =
  | { ok: true; room: RoomState }
  | { ok: false; error: string };

export class RoomManager {
  private rooms: Map<string, RoomState> = new Map();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;
  private readonly config: ServerConfig;

  constructor(config: ServerConfig) {
    this.config = config;
  }

  startCleanupTimer(): void {
    if (this.cleanupTimer) return;
    this.cleanupTimer = setInterval(() => {
      this.cleanupIdleRooms();
    }, this.config.roomTimeoutMs);
  }

  stopCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  createRoom(
    roomId: string,
    hostId: string,
    hostWs: WebSocket
  ): CreateRoomResult {
    if (!isValidRoomId(roomId)) {
      return { ok: false, error: "Invalid room ID format" };
    }
    if (this.rooms.has(roomId)) {
      return { ok: false, error: "Room already exists" };
    }
    if (this.rooms.size >= this.config.maxRoomsPerServer) {
      return { ok: false, error: "Server room limit reached" };
    }

    const room: RoomState = {
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

  joinRoom(
    roomId: string,
    viewerId: string,
    viewerWs: WebSocket
  ): JoinRoomResult {
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

  removeViewer(roomId: string, viewerId: string): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;
    return room.viewers.delete(viewerId);
  }

  deleteRoom(roomId: string): boolean {
    return this.rooms.delete(roomId);
  }

  getRoom(roomId: string): RoomState | undefined {
    return this.rooms.get(roomId);
  }

  getRooms(): Map<string, RoomState> {
    return this.rooms;
  }

  getClientCount(): number {
    let count = 0;
    for (const room of this.rooms.values()) {
      count += 1 + room.viewers.size; // host + viewers
    }
    return count;
  }

  private cleanupIdleRooms(): void {
    const now = Date.now();
    for (const [roomId, room] of this.rooms) {
      if (now - room.createdAt >= this.config.roomTimeoutMs) {
        // Notify viewers before deleting
        for (const [, viewerWs] of room.viewers) {
          try {
            viewerWs.send(JSON.stringify({ type: "session-ended" }));
          } catch {
            // viewer may already be disconnected
          }
        }
        this.rooms.delete(roomId);
      }
    }
  }
}
