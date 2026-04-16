"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const server_1 = require("./server");
const config = {
    port: parseInt(process.env.PORT || "8080", 10),
    maxRoomsPerServer: 100,
    maxViewersPerRoom: 10,
    roomTimeoutMs: 30 * 60 * 1000,
    heartbeatIntervalMs: 30 * 1000,
};
const server = new server_1.SignalingServer(config);
server.start(config.port).then(() => {
    console.log(`Signaling server running on ws://localhost:${config.port}`);
});
function shutdown() {
    console.log("Shutting down...");
    server.stop().then(() => {
        process.exit(0);
    });
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
//# sourceMappingURL=index.js.map