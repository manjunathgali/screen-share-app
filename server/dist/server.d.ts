import type { OutgoingMessage, ConnectedClient, ServerConfig } from "./types";
import { RoomManager } from "./roomManager";
export declare class SignalingServer {
    private wss;
    private connectedClients;
    private roomManager;
    private readonly config;
    constructor(config: ServerConfig);
    start(port: number): Promise<void>;
    stop(): Promise<void>;
    handleClientMessage(clientId: string, raw: string): void;
    handleClientDisconnect(clientId: string): void;
    sendToClient(clientId: string, message: OutgoingMessage): void;
    getConnectedClients(): Map<string, ConnectedClient>;
    getRoomManager(): RoomManager;
}
//# sourceMappingURL=server.d.ts.map