import type { WebSocket } from "ws";
import type { RoomState, ServerConfig } from "./types";
export declare function isValidRoomId(roomId: string): boolean;
export declare function generateRoomId(): string;
export type CreateRoomResult = {
    ok: true;
    room: RoomState;
} | {
    ok: false;
    error: string;
};
export type JoinRoomResult = {
    ok: true;
    room: RoomState;
} | {
    ok: false;
    error: string;
};
export declare class RoomManager {
    private rooms;
    private cleanupTimer;
    private readonly config;
    constructor(config: ServerConfig);
    startCleanupTimer(): void;
    stopCleanupTimer(): void;
    createRoom(roomId: string, hostId: string, hostWs: WebSocket): CreateRoomResult;
    joinRoom(roomId: string, viewerId: string, viewerWs: WebSocket): JoinRoomResult;
    removeViewer(roomId: string, viewerId: string): boolean;
    deleteRoom(roomId: string): boolean;
    getRoom(roomId: string): RoomState | undefined;
    getRooms(): Map<string, RoomState>;
    getClientCount(): number;
    private cleanupIdleRooms;
}
//# sourceMappingURL=roomManager.d.ts.map