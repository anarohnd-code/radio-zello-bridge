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
let sseClients     = new Set();  // clientes de eventos de Blogger
let wsClients      = new Set();  // clientes de audio WebSocket de Blogger
let kickedByServer = false;      // ¡PROTECCIÓN CONTRA EL BUCLE MORTAL DE RENDER!

// ── Broadcast SSE ─────────────────────────────────────────────────────────────
function broadcast(data) {
  const payload = "data: " + JSON.stringify(data) + "\n\n";
  for (const res of sseClients) {
    try { res.write(payload); } catch (_) {}
  }
}

// ── Broadcast audio — Envía Float32 PCM purificado a los oyentes de la web ────
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

// ── Conexión ÚNICA y Permanente a Zello ───────────────────────────────────────
function connectToZello() {
  if (zelloWs && zelloWs.readyState === WebSocket.OPEN) return;
  
  console.log("Conectando a Zello de forma centralizada...");
  zelloWs = new WebSocket("wss://zello.io/ws");

  zelloWs.on("open", () => {
    console.log("¡Conexión con Zello Establecida! Enviando credenciales...");
    kickedByServer = false; // Reiniciamos la bandera al conectar con éxito
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
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch (_) {
      // Es paquete de AUDIO binario proveniente de Zello
      if (Buffer.isBuffer(raw) && raw.length > 5) {
        const audioData = raw.slice(5);
        if (audioData.length > 0 && opusDecoder) {
          try {
            const decoded = opusDecoder.decode(audioData);
            if (!decoded || decoded.length === 0) return;

            const pcm = new Int16Array(decoded.buffer, decoded.byteOffset, decoded.length / 2);

            // Filtro de silencio absoluto
            let maxVal = 0;
            for (let i = 0; i < pcm.length; i++) {
              const abs = Math.abs(pcm[i]);
              if (abs > maxVal) maxVal = abs;
            }
            if (maxVal < 40) return; 

            // Conversión limpia a Float32 para los navegadores
            const float32 = new Float32Array(pcm.length);
            for (let i = 0; i < pcm.length; i++) {
              float32[i] = pcm[i] / 32768.0;
            }

            broadcastAudio(float32);
          } catch (decErr) {
            console.error("Error al decodificar frame Opus:", decErr.message);
          }
        }
      }
      return;
    }

    // Procesar comandos de estado de Zello
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
      console.error("ALERTA Zello:", msg.error);
      if (msg.error === "kicked") {
        console.warn("Zello solicitó desconexión del bot por doble sesión.");
        kickedByServer = true; // Marcamos que fuimos expulsados legítimamente
      }
    }
  });

  zelloWs.on("close", (code, reason) => {
    if (kickedByServer) {
      console.warn(`Conexión cerrada por expulsión (kicked). No se reconectará automáticamente para no tumbar la nueva instancia activa.`);
      broadcast({ type: "disconnected" });
      return; // ¡AQUÍ ROMPEMOS EL BUCLE INFERNAL!
    }
    console.warn(`Conexión con Zello cerrada (${code}). Reintentando en 5 segundos...`);
    broadcast({ type: "disconnected" });
    setTimeout(connectToZello, 5000);
  });

  zelloWs.on("error", (err) => {
    console.error("Error en WebSocket de Zello:", err.message);
  });
}

// ── Rutas de servidor ────────────────────────────────────────────────────────
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

// Decodificador de Audio
const OpusScript = require("opusscript");
let opusDecoder   = null;
try {
  opusDecoder = new OpusScript(16000, 1, OpusScript.Application.VOIP);
  console.log("✅ Decodificador de audio Opus inicializado");
} catch(e) {
  console.error("❌ Error en decodificador:", e.message);
}

// ── Servidor de Distribución Web (Blogger se conecta aquí) ───────────────────
const server = require("http").createServer(app);
const wss = new WebSocket.Server({ server, path: "/audio" });

wss.on("connection", (ws) => {
  wsClients.add(ws);
  ws.on("close", () => {
    wsClients.delete(ws);
  });
});

server.listen(PORT, () => {
  console.log(`Servidor activo en puerto ${PORT}`);
  connectToZello(); // Se conecta una sola vez al arrancar de forma limpia
});
