const express   = require("express");
const cors      = require("cors");
const WebSocket = require("ws");

const app = express();
app.use(cors());
app.use(express.json());

const AUTH_TOKEN = process.env.ZELLO_AUTH_TOKEN;
const USERNAME   = process.env.ZELLO_USERNAME;
const PASSWORD   = process.env.ZELLO_PASSWORD;
const CHANNEL    = process.env.ZELLO_CHANNEL || "Cedec Ministerios";
const PORT       = process.env.PORT || 3000;

// ── Estado global ─────────────────────────────────────────────────────────────
let connectedUsers = [];
let messageHistory = [];
let zelloWs        = null;
let sseClients     = new Set();  // clientes de eventos
let wsClients      = new Set();  // clientes de audio WebSocket

// ── Broadcast SSE ─────────────────────────────────────────────────────────────
function broadcast(data) {
  const payload = "data: " + JSON.stringify(data) + "\n\n";
  for (const res of sseClients) {
    try { res.write(payload); } catch (_) {}
  }
}

// ── Broadcast audio binario a todos los clientes WS ──────────────────────────
function broadcastAudio(buffer) {
  for (const ws of wsClients) {
    try {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(buffer);
      }
    } catch (_) {}
  }
}

// ── Conexión a Zello ──────────────────────────────────────────────────────────
function connectToZello() {
  console.log("Conectando a Zello...");
  zelloWs = new WebSocket("wss://zello.io/ws");

  zelloWs.on("open", () => {
    console.log("Conexión abierta. Enviando logon...");
    zelloWs.send(JSON.stringify({
      command:    "logon",
      seq:        1,
      auth_token: AUTH_TOKEN,
      username:   USERNAME,
      password:   PASSWORD,
      channel:    CHANNEL
    }));
  });

  // ── Mensajes de texto (JSON) ──────────────────────────────────────────────
  zelloWs.on("message", (raw, isBinary) => {

    // Intentar parsear como JSON primero
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch (_) {
      // No es JSON — es paquete de AUDIO binario
      if (Buffer.isBuffer(raw) && raw.length > 9) {
        const audioData = raw.slice(9);
        if (audioData.length > 0) broadcastAudio(audioData);
      }
      return;
    }

    // Mensaje de control — JSON
    console.log("Zello →", msg);

    if (msg.command === "on_channel_status") {
      broadcast({ type: "status", channel: msg.channel, online: msg.online });
    }
    if (msg.command === "on_online_users") {
      connectedUsers = msg.online_users || [];
      broadcast({ type: "users", users: connectedUsers });
    }
    if (msg.command === "on_stream_start") {
      broadcast({ type: "talking", user: msg.from, active: true });
      console.log("🎙️ Transmitiendo:", msg.from);
    }
    if (msg.command === "on_stream_stop") {
      broadcast({ type: "talking", user: msg.from, active: false });
      console.log("⏹️ Paró:", msg.from);
    }
    if (msg.command === "on_text_message") {
      const entry = { user: msg.from, text: msg.text, ts: Date.now() };
      messageHistory.push(entry);
      if (messageHistory.length > 50) messageHistory.shift();
      broadcast({ type: "text", ...entry });
    }
    if (msg.error) {
      console.error("ERROR Zello:", msg.error);
      broadcast({ type: "error", error: msg.error });
    }
  });

  zelloWs.on("close", (code, reason) => {
    console.warn(`Zello cerró (${code}): ${reason}. Reconectando en 5s...`);
    broadcast({ type: "disconnected" });
    setTimeout(connectToZello, 5000);
  });

  zelloWs.on("error", (err) => {
    console.error("Error WebSocket Zello:", err.message);
  });
}

// ── Rutas HTTP ────────────────────────────────────────────────────────────────

// Health check
app.get("/", (_, res) => res.json({ status: "ok", channel: CHANNEL }));

// SSE — eventos en tiempo real
app.get("/events", (req, res) => {
  res.setHeader("Content-Type",  "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection",    "keep-alive");
  res.flushHeaders();

  res.write("data: " + JSON.stringify({
    type:    "init",
    users:   connectedUsers,
    history: messageHistory
  }) + "\n\n");

  sseClients.add(res);
  req.on("close", () => sseClients.delete(res));
});

app.get("/history", (_, res) => res.json(messageHistory));
app.get("/users",   (_, res) => res.json(connectedUsers));

// ── Servidor HTTP + WebSocket para audio ─────────────────────────────────────
const server = require("http").createServer(app);

const wss = new WebSocket.Server({ server, path: "/audio" });

wss.on("connection", (ws) => {
  console.log("🔊 Cliente de audio conectado");
  wsClients.add(ws);
  ws.on("close", () => {
    wsClients.delete(ws);
    console.log("🔇 Cliente de audio desconectado");
  });
});

server.listen(PORT, () => {
  console.log(`Servidor escuchando en puerto ${PORT}`);
  connectToZello();
});
