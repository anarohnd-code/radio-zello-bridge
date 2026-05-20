const express = require('express');
const jwt = require('jsonwebtoken');
const WebSocket = require('ws');

const app = express();
const port = process.env.PORT || 10000;

app.get('/', (req, res) => {
    res.send('Puente Zello Activo');
});

const server = app.listen(port, () => {
    console.log('Servidor corriendo en el puerto ' + port);
});

const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
    console.log('Cliente de Blogger conectado al puente');

    const issuerId = process.env.ZELLO_ISSUER;
    const payload = {
        iss: issuerId,
        exp: Math.floor(Date.now() / 1000) + (60 * 60),
        sd: "listen"
    };

    let zelloToken;

    try {
        const base64Key = process.env.ZELLO_PRIVATE_KEY || '';
        const privateKey = Buffer.from(base64Key, 'base64').toString('utf8');
        zelloToken = jwt.sign(payload, privateKey, { algorithm: 'RS256' });
    } catch (err) {
        console.error('Error al firmar el token con la Private Key: ' + err.message);
        ws.close();
        return;
    }

    const zelloWs = new WebSocket('wss://zello.me/api/v1/stream?token=' + zelloToken);

    zelloWs.on('open', () => {
        console.log('Conexión exitosa con la API de Zello');
    });

    zelloWs.on('error', (error) => {
        console.error('Error en la conexión con Zello: ' + error.message);
    });

    zelloWs.on('message', (data) => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(data);
        }
    });

    ws.on('message', (message) => {
        if (zelloWs.readyState === WebSocket.OPEN) {
            zelloWs.send(message);
        }
    });

    ws.on('close', () => {
        console.log('Cliente de Blogger desconectado');
        zelloWs.close();
    });
});
