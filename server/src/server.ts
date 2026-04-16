import { WebSocketServer, WebSocket } from "ws";
import { v4 as uuidv4 } from "uuid";
import type {
  IncomingMessage,
  OutgoingMessage,
  ConnectedClient,
  ServerConfig,
} from "./types";
import { RoomManager } from "./roomManager";

const VALID_MESSAGE_TYPES = new Set([
  "create-room",
  "join-room",
  "offer",
  "answer",
  "ice-candidate",
  "end-session",
  "ping",
]);

export class SignalingServer {
  private wss: WebSocketServer | null = null;
  private connectedClients: Map<string, ConnectedClient> = new Map();
  private roomManager: RoomManager;
  private readonly config: ServerConfig;

  constructor(config: ServerConfig) {
    this.config = config;
    this.roomManager = new RoomManager(config);
  }

  start(port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      this.wss = new WebSocketServer({ port, host: "0.0.0.0" });

      this.wss.on("listening", () => {
        this.roomManager.startCleanupTimer();
        resolve();
      });

      this.wss.on("error", (err) => {
        reject(err);
      });

      this.wss.on("connection", (ws: WebSocket) => {
        const clientId = uuidv4();
        const client: ConnectedClient = {
          id: clientId,
          ws,
          roomId: null,
          role: null,
        };
        this.connectedClients.set(clientId, client);
        console.log(`[CONNECT] Client ${clientId.slice(0, 8)} connected (total: ${this.connectedClients.size})`);

        this.sendToClient(clientId, { type: "welcome", clientId });

        ws.on("message", (raw: Buffer | string) => {
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

  stop(): Promise<void> {
    return new Promise((resolve) => {
      this.roomManager.stopCleanupTimer();
      if (this.wss) {
        this.wss.close(() => {
          this.wss = null;
          this.connectedClients.clear();
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  handleClientMessage(clientId: string, raw: string): void {
    const client = this.connectedClients.get(clientId);
    if (!client) return;

    let message: IncomingMessage;
    try {
      message = JSON.parse(raw);
    } catch {
      this.sendToClient(clientId, {
        type: "error",
        message: "Invalid JSON",
      });
      return;
    }

    if (
      !message ||
      typeof message !== "object" ||
      !VALID_MESSAGE_TYPES.has(message.type)
    ) {
      this.sendToClient(clientId, {
        type: "error",
        message: "Invalid message type",
      });
      return;
    }

    switch (message.type) {
      case "create-room": {
        console.log(`[ROOM] Client ${clientId.slice(0, 8)} creating room: ${message.roomId}`);
        const result = this.roomManager.createRoom(
          message.roomId,
          clientId,
          client.ws
        );
        if (result.ok) {
          client.roomId = message.roomId;
          client.role = "host";
          this.sendToClient(clientId, {
            type: "room-created",
            roomId: message.roomId,
          });
        } else {
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
        const result = this.roomManager.joinRoom(
          message.roomId,
          clientId,
          client.ws
        );
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
        } else {
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

      case "ping": {
        // Keepalive — no action needed
        break;
      }
    }
  }

  handleClientDisconnect(clientId: string): void {
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
    } else if (client.role === "viewer") {
      this.roomManager.removeViewer(client.roomId, clientId);
      this.sendToClient(room.hostId, {
        type: "peer-left",
        peerId: clientId,
      });
    }

    this.connectedClients.delete(clientId);
  }

  sendToClient(clientId: string, message: OutgoingMessage): void {
    const client = this.connectedClients.get(clientId);
    if (client && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify(message));
    }
  }

  getConnectedClients(): Map<string, ConnectedClient> {
    return this.connectedClients;
  }

  getRoomManager(): RoomManager {
    return this.roomManager;
  }
}
