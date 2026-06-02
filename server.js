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
    
    // 1. Iniciar sesión
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
    
    // 1. PROCESAMIENTO DE AUDIO BINARIO DE ZELLO (CORREGIDO A 9 BYTES)
    if (isBinary || (Buffer.isBuffer(raw) && raw.length > 0 && raw[0] === 1)) {
      if (raw.length > 9) {
        // Cortamos en 9: [1 byte Tipo] + [4 bytes Stream ID] + [4 bytes Packet ID]
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
            for (let i = 0; i < pcm.length; i++) {
              float32[i] = pcm[i] / 32768.0;
            }

            broadcastAudio(float32);
          } catch (decErr) {
            // Ignoramos errores de paquetes sueltos
          }
        }
      }
      return; // Si era audio, terminamos aquí para no romper el JSON
    }

    // 2. PROCESAMIENTO DE MENSAJES DE TEXTO Y ESTADO (JSON)
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch (_) {
      return;
    }

    // RESPUESTA AL LOGON: COMANDO CRÍTICO DE ENTRADA AL CANAL
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
      currentTalker = msg.from;
      broadcast({ type: "talking", user: msg.from, active: true });
      console.log("🎙️ Transmitiendo en vivo:", msg.from);
    }
    if (msg.command === "on_stream_stop") {
      broadcast({ type: "talking", user: currentTalker || msg.from, active: false });
      console.log("⏹️ Transmisión pausada");
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
});
