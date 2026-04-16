import type { WebSocket } from "ws";
export type IncomingMessage = {
    type: "create-room";
    roomId: string;
} | {
    type: "join-room";
    roomId: string;
} | {
    type: "offer";
    targetId: string;
    sdp: string;
} | {
    type: "answer";
    targetId: string;
    sdp: string;
} | {
    type: "ice-candidate";
    targetId: string;
    candidate: string;
    sdpMid: string;
    sdpMLineIndex: number;
} | {
    type: "end-session";
};
export type OutgoingMessage = {
    type: "welcome";
    clientId: string;
} | {
    type: "room-created";
    roomId: string;
} | {
    type: "room-joined";
    roomId: string;
    hostId: string;
} | {
    type: "peer-joined";
    peerId: string;
} | {
    type: "peer-left";
    peerId: string;
} | {
    type: "offer";
    peerId: string;
    sdp: string;
} | {
    type: "answer";
    peerId: string;
    sdp: string;
} | {
    type: "ice-candidate";
    peerId: string;
    candidate: string;
    sdpMid: string;
    sdpMLineIndex: number;
} | {
    type: "session-ended";
} | {
    type: "error";
    message: string;
};
export interface Room {
    roomId: string;
    hostId: string;
    viewers: Set<string>;
    createdAt: number;
}
export interface ConnectedClient {
    id: string;
    ws: WebSocket;
    roomId: string | null;
    role: "host" | "viewer" | null;
}
export interface ServerConfig {
    port: number;
    maxRoomsPerServer: number;
    maxViewersPerRoom: number;
    roomTimeoutMs: number;
    heartbeatIntervalMs: number;
}
export interface RoomState {
    roomId: string;
    hostId: string;
    hostWs: WebSocket;
    viewers: Map<string, WebSocket>;
    createdAt: number;
    maxViewers: number;
}
//# sourceMappingURL=types.d.ts.map