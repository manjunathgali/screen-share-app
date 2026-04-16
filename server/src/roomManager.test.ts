import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { WebSocket } from "ws";
import type { ServerConfig } from "./types";
import {
  RoomManager,
  isValidRoomId,
  generateRoomId,
} from "./roomManager";

function mockWs(): WebSocket {
  return { send: vi.fn(), readyState: 1 } as unknown as WebSocket;
}

const defaultConfig: ServerConfig = {
  port: 8080,
  maxRoomsPerServer: 100,
  maxViewersPerRoom: 10,
  roomTimeoutMs: 30 * 60 * 1000,
  heartbeatIntervalMs: 30000,
};

describe("isValidRoomId", () => {
  it("accepts valid 6-char alphanumeric IDs", () => {
    expect(isValidRoomId("abc123")).toBe(true);
    expect(isValidRoomId("ABCDEF")).toBe(true);
    expect(isValidRoomId("a1B2c3")).toBe(true);
  });

  it("rejects IDs that are too short or too long", () => {
    expect(isValidRoomId("abc12")).toBe(false);
    expect(isValidRoomId("abc1234")).toBe(false);
    expect(isValidRoomId("")).toBe(false);
  });

  it("rejects IDs with special characters", () => {
    expect(isValidRoomId("abc-12")).toBe(false);
    expect(isValidRoomId("abc_12")).toBe(false);
    expect(isValidRoomId("abc 12")).toBe(false);
  });
});

describe("generateRoomId", () => {
  it("generates a 6-char alphanumeric string", () => {
    const id = generateRoomId();
    expect(id).toHaveLength(6);
    expect(isValidRoomId(id)).toBe(true);
  });
});

describe("RoomManager", () => {
  let manager: RoomManager;

  beforeEach(() => {
    manager = new RoomManager(defaultConfig);
  });

  afterEach(() => {
    manager.stopCleanupTimer();
  });

  describe("createRoom", () => {
    it("creates a room with valid inputs", () => {
      const ws = mockWs();
      const result = manager.createRoom("abc123", "host-1", ws);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.room.roomId).toBe("abc123");
        expect(result.room.hostId).toBe("host-1");
        expect(result.room.viewers.size).toBe(0);
      }
    });

    it("rejects invalid room ID format", () => {
      const result = manager.createRoom("bad!", "host-1", mockWs());
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe("Invalid room ID format");
    });

    it("rejects duplicate room ID", () => {
      manager.createRoom("abc123", "host-1", mockWs());
      const result = manager.createRoom("abc123", "host-2", mockWs());
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe("Room already exists");
    });

    it("enforces maxRoomsPerServer", () => {
      const smallConfig = { ...defaultConfig, maxRoomsPerServer: 2 };
      const mgr = new RoomManager(smallConfig);
      mgr.createRoom("aaaaaa", "h1", mockWs());
      mgr.createRoom("bbbbbb", "h2", mockWs());
      const result = mgr.createRoom("cccccc", "h3", mockWs());
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe("Server room limit reached");
    });
  });

  describe("joinRoom", () => {
    it("adds a viewer to an existing room", () => {
      manager.createRoom("abc123", "host-1", mockWs());
      const result = manager.joinRoom("abc123", "viewer-1", mockWs());
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.room.viewers.size).toBe(1);
        expect(result.room.viewers.has("viewer-1")).toBe(true);
      }
    });

    it("returns error for non-existent room", () => {
      const result = manager.joinRoom("noroom", "viewer-1", mockWs());
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe("Room not found");
    });

    it("enforces maxViewersPerRoom", () => {
      const smallConfig = { ...defaultConfig, maxViewersPerRoom: 1 };
      const mgr = new RoomManager(smallConfig);
      mgr.createRoom("abc123", "host-1", mockWs());
      mgr.joinRoom("abc123", "v1", mockWs());
      const result = mgr.joinRoom("abc123", "v2", mockWs());
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe("Room is full");
    });
  });

  describe("removeViewer", () => {
    it("removes a viewer from a room", () => {
      manager.createRoom("abc123", "host-1", mockWs());
      manager.joinRoom("abc123", "v1", mockWs());
      expect(manager.removeViewer("abc123", "v1")).toBe(true);
      expect(manager.getRoom("abc123")!.viewers.size).toBe(0);
    });

    it("returns false for non-existent room", () => {
      expect(manager.removeViewer("noroom", "v1")).toBe(false);
    });
  });

  describe("deleteRoom", () => {
    it("deletes an existing room", () => {
      manager.createRoom("abc123", "host-1", mockWs());
      expect(manager.deleteRoom("abc123")).toBe(true);
      expect(manager.getRoom("abc123")).toBeUndefined();
    });

    it("returns false for non-existent room", () => {
      expect(manager.deleteRoom("noroom")).toBe(false);
    });
  });

  describe("getRoom / getRooms", () => {
    it("returns the room by ID", () => {
      manager.createRoom("abc123", "host-1", mockWs());
      expect(manager.getRoom("abc123")).toBeDefined();
      expect(manager.getRoom("abc123")!.hostId).toBe("host-1");
    });

    it("returns all rooms", () => {
      manager.createRoom("aaaaaa", "h1", mockWs());
      manager.createRoom("bbbbbb", "h2", mockWs());
      expect(manager.getRooms().size).toBe(2);
    });
  });

  describe("getClientCount", () => {
    it("counts hosts and viewers across all rooms", () => {
      manager.createRoom("aaaaaa", "h1", mockWs());
      manager.createRoom("bbbbbb", "h2", mockWs());
      manager.joinRoom("aaaaaa", "v1", mockWs());
      manager.joinRoom("aaaaaa", "v2", mockWs());
      manager.joinRoom("bbbbbb", "v3", mockWs());
      // 2 hosts + 3 viewers = 5
      expect(manager.getClientCount()).toBe(5);
    });

    it("returns 0 when no rooms exist", () => {
      expect(manager.getClientCount()).toBe(0);
    });
  });

  describe("idle room cleanup", () => {
    it("cleans up rooms that exceed roomTimeoutMs", () => {
      vi.useFakeTimers();
      const config = { ...defaultConfig, roomTimeoutMs: 1000 };
      const mgr = new RoomManager(config);
      const viewerWs = mockWs();

      mgr.createRoom("abc123", "host-1", mockWs());
      mgr.joinRoom("abc123", "v1", viewerWs);

      mgr.startCleanupTimer();

      // Advance past the timeout
      vi.advanceTimersByTime(1500);

      expect(mgr.getRoom("abc123")).toBeUndefined();
      expect(viewerWs.send).toHaveBeenCalledWith(
        JSON.stringify({ type: "session-ended" })
      );

      mgr.stopCleanupTimer();
      vi.useRealTimers();
    });
  });
});
