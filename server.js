import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { WebSocketServer } from "ws";

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(process.cwd(), "public");

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  let filePath = url.pathname === "/" ? "/index.html" : url.pathname;
  filePath = path.normalize(filePath).replace(/^\.\.(\/|\\)/, "");
  const absPath = path.join(PUBLIC_DIR, filePath);

  fs.readFile(absPath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not found");
      return;
    }

    const ext = path.extname(absPath).toLowerCase();
    const contentType =
      ext === ".html"
        ? "text/html"
        : ext === ".js"
        ? "text/javascript"
        : ext === ".css"
        ? "text/css"
        : "application/octet-stream";

    res.writeHead(200, { "Content-Type": contentType });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server, path: "/ws" });

const rooms = new Map();
// rooms: roomCode -> Map(clientId, { ws, username })

function send(ws, payload) {
  ws.send(JSON.stringify(payload));
}

function broadcast(roomCode, payload, exceptId = null) {
  const room = rooms.get(roomCode);
  if (!room) return;
  for (const [id, client] of room.entries()) {
    if (id === exceptId) continue;
    send(client.ws, payload);
  }
}

function cleanupClient(roomCode, clientId) {
  const room = rooms.get(roomCode);
  if (!room) return;
  const client = room.get(clientId);
  room.delete(clientId);
  if (room.size === 0) {
    rooms.delete(roomCode);
  } else if (client) {
    broadcast(roomCode, { type: "peer-left", id: clientId });
  }
}

wss.on("connection", (ws) => {
  let currentRoom = null;
  let clientId = null;

  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    if (msg.type === "join") {
      const roomCode = String(msg.room || "").trim();
      const username = String(msg.username || "").trim();
      if (!roomCode || !username) {
        send(ws, { type: "error", message: "room and username required" });
        return;
      }

      currentRoom = roomCode;
      clientId = cryptoRandomId();

      if (!rooms.has(roomCode)) rooms.set(roomCode, new Map());
      const room = rooms.get(roomCode);
      room.set(clientId, { ws, username });

      const peers = Array.from(room.entries())
        .filter(([id]) => id !== clientId)
        .map(([id, c]) => ({ id, username: c.username }));

      send(ws, { type: "joined", id: clientId, peers });
      broadcast(roomCode, { type: "peer-joined", id: clientId, username }, clientId);
      return;
    }

    if (!currentRoom || !clientId) return;

    if (msg.type === "signal") {
      const { to, data } = msg;
      const room = rooms.get(currentRoom);
      const target = room?.get(to);
      if (target) {
        send(target.ws, { type: "signal", from: clientId, data });
      }
      return;
    }
  });

  ws.on("close", () => {
    if (currentRoom && clientId) cleanupClient(currentRoom, clientId);
  });
});

function cryptoRandomId() {
  return Math.random().toString(36).slice(2, 10);
}

server.listen(PORT, () => {
  console.log(`Server on http://localhost:${PORT}`);
});
