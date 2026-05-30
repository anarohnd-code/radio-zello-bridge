const express = require("express");
const cors    = require("cors");
const WebSocket = require("ws");

const app = express();
app.use(cors());
app.use(express.json());

const AUTH_TOKEN = process.env.ZELLO_AUTH_TOKEN;
const USERNAME   = process.env.ZELLO_USERNAME;
const PASSWORD   = process.env.ZELLO_PASSWORD;
const CHANNEL    = process.env.ZELLO_CHANNEL || "Cedec Ministerios";
const PORT       = process.env.PORT || 3000;

let connectedUsers = [];
let messageHistory = [];
let zelloWs        = null;
let clients        = new Set();

function broadcast(data) {
  const payload = "data: " + JSON.stringify(data) + "\n\n";
  for (const res of clients) {
    try { res.write(payload); } catch (_) {}
  }
}

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

  zelloWs.on("message", (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch (_) { return; }
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
    }
    if (msg.command === "on_stream_stop") {
      broadcast({ type: "talking", user: msg.from, active: false });
    }
    if (msg.command === "on_text_message") {
      const entry = { user: msg.from, text: msg.text, ts: Date.now() };
      messageHistory.push(entry);
      if (messageHistory.length > 50) messageHistory.shift();
      broadcast({ type: "text", ...entry });
    }
    if (msg.error) {
      console.error("ERROR de Zello:", msg.error);
      broadcast({ type: "error", error: msg.error });
    }
  });

  zelloWs.on("close", (code, reason) => {
    console.warn(`Zello cerró conexión (${code}): ${reason}. Reconectando en 5s...`);
    broadcast({ type: "disconnected" });
    setTimeout(connectToZello, 5000);
  });

  zelloWs.on("error", (err) => {
    console.error("Error WebSocket:", err.message);
  });
}

app.get("/", (_, res) => res.json({ status: "ok", channel: CHANNEL }));

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

  clients.add(res);
  req.on("close", () => clients.delete(res));
});

app.get("/history", (_, res) => res.json(messageHistory));
app.get("/users",   (_, res) => res.json(connectedUsers));

app.listen(PORT, () => {
  console.log(`Servidor escuchando en puerto ${PORT}`);
  connectToZello();
});
