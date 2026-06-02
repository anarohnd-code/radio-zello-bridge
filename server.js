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
    
    // ... (El resto de tus condicionales if (msg.command === "on_channel_status") siguen igual hacia abajo)
