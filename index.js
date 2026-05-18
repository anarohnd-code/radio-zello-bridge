const express = require('express');
const WebSocket = require('ws');
const jwt = require('jsonwebtoken');

const app = express();
const port = process.env.PORT || 3000;

const ISSUER = process.env.ZELLO_ISSUER;
const PRIVATE_KEY = process.env.ZELLO_PRIVATE_KEY ? process.env.ZELLO_PRIVATE_KEY.replace(/\\n/g, '\n') : null;

app.get('/', (req, res) => {
    res.send('📻 Servidor Puente de Radio Zello Pro - Activo y Operando');
});

const server = app.listen(port, () => {
    console.log(Servidor corriendo en el puerto ${port});
});

const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
    console.log('Cliente de Blogger conectado al puente');

    if (!ISSUER || !PRIVATE_KEY) {
        console.error('Faltan las variables de entorno ZELLO_ISSUER o ZELLO_PRIVATE_KEY');
        ws.close();
        return;
    }

    const payload = {
        iss: ISSUER,
        exp: Math.floor(Date.now() / 1000) + 60
    };
    
    let zelloToken;
    try {
        zelloToken = jwt.sign(payload, PRIVATE_KEY, { algorithm: 'RS256' });
    } catch (err) {
        console.error('Error al firmar el token con la Private Key:', err.message);
        ws.close();
        return;
    }

    const zelloWs = new WebSocket(wss://zello.page/api/v1/stream?token=${zelloToken});

    zelloWs.on('open', () => {
        console.log('Conexión exitosa con la API de Zello');
    });

    zelloWs.on('message', (data) => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(data);
        }
    });

    zelloWs.on('close', () => {
        console.log('Conexión con Zello cerrada');
        ws.close();
    });

    ws.on('close', () => {
        console.log('Cliente de Blogger desconectado');
        zelloWs.close();
    });
});