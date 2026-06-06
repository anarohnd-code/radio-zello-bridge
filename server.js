const express   = require("express");
const cors      = require("cors");
const WebSocket = require("ws");

const app = express();

app.use(cors());
app.use(express.json());

const AUTH_TOKEN = process.env.ZELLO_AUTH_TOKEN;
const USERNAME    = process.env.ZELLO_USERNAME;
const PASSWORD    = process.env.ZELLO_PASSWORD;
const CHANNEL     = process.env.ZELLO_CHANNEL || "Cedec Ministerios";
const PORT        = process.env.PORT || 3000;

// ── Estado global ─────────────────────────────────────────────────────────────
let connectedUsers = [];
let messageHistory = [];
let zelloWs        = null;
let currentTalker  = null;
let sseClients     = new Set();  
let wsClients      = new Set();  
let kickedByServer = false;      

function broadcast(data) {
  const payload = "data: " + JSON.stringify(data) + "\n\n";
  for (const res of sseClients) {
    try { res.write(payload); } catch (_) {}
  }
}

function broadcastAudio(float32Array) {
  if (wsClients.size === 0) return;
  const outBuffer = Buffer.from(float32Array.buffer);
  for (const ws of wsClients) {
    try {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(outBuffer);
      }
    } catch (_) {}
  }
}

// ── Conexión y Autenticación Estricta ────────────────────────────────────────
function connectToZello() {
  if (zelloWs && zelloWs.readyState === WebSocket.OPEN) return;
  
  console.log(`Conectando a Zello como ${USERNAME}...`);
  zelloWs = new WebSocket("wss://zello.io/ws");

  zelloWs.on("open", () => {
    console.log("¡Conexión establecida! Autenticando cuenta bot...");
    kickedByServer = false;
    
    zelloWs.send(JSON.stringify({
      command:    "logon",
      seq:        1,
      auth_token: AUTH_TOKEN,
      username:   USERNAME,
      password:   PASSWORD,
      channel:    CHANNEL
    }));
  });

  zelloWs.on("message", (raw, isBinary) => {
    
    // 1. PROCESAMIENTO DE AUDIO BINARIO (CON FILTRO SUAVIZADOR ANTI-CHASQUIDOS)
    if (isBinary || (Buffer.isBuffer(raw) && raw.length > 0 && raw[0] === 1)) {
      if (raw.length > 9) {
        const audioData = raw.slice(9); 
        
        if (audioData.length > 0 && opusDecoder) {
          try {
            const decoded = opusDecoder.decode(audioData);
            if (!decoded || decoded.length === 0) return;

            const pcm = new Int16Array(decoded.buffer, decoded.byteOffset, decoded.length / 2);

            let maxVal = 0;
            for (let i = 0; i < pcm.length; i++) {
              const abs = Math.abs(pcm[i]);
              if (abs > maxVal) maxVal = abs;
            }
            if (maxVal < 40) return; 

            const float32 = new Float32Array(pcm.length);
            const fadeLength = Math.min(40, pcm.length / 2); 
            for (let i = 0; i < pcm.length; i++) {
              let sample = pcm[i] / 32768.0;
              if (i < fadeLength) {
                sample *= (i / fadeLength);
              } else if (i > pcm.length - fadeLength) {
                sample *= ((pcm.length - i) / fadeLength);
              }
              float32[i] = sample;
            }

            broadcastAudio(float32);
          } catch (decErr) {
            // Ignorar pérdidas menores de paquetes
          }
        }
      }
      return; 
    }

    // 2. PROCESAMIENTO DE MENSAJES JSON
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch (_) {
      return;
    }

    if (msg.command === "on_logon" && msg.refresh_token) {
      console.log("✅ Bot autenticado. Registrando escucha activa en el canal...");
      zelloWs.send(JSON.stringify({ command: "listen", seq: 2, channel: CHANNEL }));
    }

    if (msg.command === "on_channel_status") {
      broadcast({ type: "status", channel: msg.channel, online: msg.status === "online" });
    }
    if (msg.command === "on_online_users") {
      connectedUsers = msg.online_users || [];
      broadcast({ type: "users", users: connectedUsers });
    }
    if (msg.command === "on_stream_start") {
      currentTalker = msg.from || msg.contactName || "Transmitiendo...";
      broadcast({ type: "talking", user: currentTalker, active: true });
      console.log("🎙️ Transmitiendo en vivo:", currentTalker);
    }
    if (msg.command === "on_stream_stop") {
      var talker = currentTalker || "Canal";
      broadcast({ type: "talking", user: talker, active: false });
      console.log("⏹️ Paró:", talker);
      currentTalker = null;
    }
    if (msg.command === "on_text_message") {
      const entry = { user: msg.from, text: msg.text, ts: Date.now() };
      messageHistory.push(entry);
      if (messageHistory.length > 50) messageHistory.shift();
      broadcast({ type: "text", ...entry });
    }
    if (msg.error) {
      console.error("ALERTA SERVIDOR ZELLO:", msg.error);
      if (msg.error === "kicked") {
        kickedByServer = true; 
      }
    }
  });

  zelloWs.on("close", (code, reason) => {
    if (kickedByServer) {
      console.warn(`Bot expulsado (kicked). Reintentando conexión segura en 10 segundos...`);
      broadcast({ type: "disconnected" });
      setTimeout(connectToZello, 10000); 
      return;
    }
    console.warn(`Conexión cerrada (${code}). Reconfigurando en 5s...`);
    broadcast({ type: "disconnected" });
    setTimeout(connectToZello, 5000);
  });

  zelloWs.on("error", (err) => {
    console.error("Error en WebSocket:", err.message);
  });
}

// ── Rutas ────────────────────────────────────────────────────────────────────
app.get("/", (_, res) => res.json({ status: "online", channel: CHANNEL, botConnected: !!zelloWs }));

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

// ── Enviar mensaje de texto al canal desde la web ─────────────────────────────
app.post("/send-message", (req, res) => {
  const { text, user } = req.body;
  if (!text || !zelloWs || zelloWs.readyState !== WebSocket.OPEN) {
    return res.status(400).json({ error: "No conectado o mensaje vacío" });
  }
  try {
    zelloWs.send(JSON.stringify({
      command: "send_text_message",
      seq: Date.now(),
      channel: CHANNEL,
      text: text
    }));
    const entry = { user: user || "Oyente Web", text, ts: Date.now() };
    messageHistory.push(entry);
    if (messageHistory.length > 50) messageHistory.shift();
    res.json({ ok: true });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

const OpusScript = require("opusscript");
let opusDecoder   = null;
try {
  opusDecoder = new OpusScript(16000, 1, OpusScript.Application.VOIP);
  console.log("✅ Decodificador de audio Opus listo");
} catch(e) {
  console.error("❌ Error en decodificador:", e.message);
}

const server = require("http").createServer(app);
const wss = new WebSocket.Server({ server, path: "/audio" });

wss.on("connection", (ws) => {
  wsClients.add(ws);
  ws.on("close", () => wsClients.delete(ws));
});

server.listen(PORT, () => {
  console.log(`Servidor activo en puerto ${PORT}`);
  connectToZello();
  
  // ── Keep-alive: evita que Render duerma el servidor ──────────────────────
  const https = require("https");
  const RENDER_URL = process.env.RENDER_EXTERNAL_URL;
  if (RENDER_URL) {
    setInterval(() => {
      https.get(RENDER_URL + "/", (res) => {
        console.log("🏓 Keep-alive ping:", res.statusCode);
      }).on("error", (e) => {
        console.warn("Keep-alive error:", e.message);
      });
    }, 10 * 60 * 1000); // cada 10 minutos
    console.log("✅ Keep-alive activo");
  }
});
