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

const payload = {
iss: 'cedec_radio',
exp: Math.floor(Date.now() / 1000) + (60 * 60)
}; 

let zelloToken; 

try {
const llaveDirecta =`-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA1432B7cBNYTQhiQBOAZc
b+HCC8HRs6ppRvJSpc/7v5FGa6Fx9Eji6IwrMnIQWAMrBZ7CBtmkQXfD6Jj3Jvux
ylQcHXsa4mPAdgd3Iz/0IkSAEnTQsk61S48ROtDIk2Lahbe53dMmcjxPDNDtKCmw
pXAUEf4fAOFNp7E0VAFHXcnvKTuWzZjo0+LhZwSOoNuGcV1qvbJWXMIFBFUanMjo
A1wO0U+PN7d0rvMZcxEFirA++36d3Vw3QM/XVPC8FblfFXpwLui/yUT+dlxidDnp
ZgnO+YxVGpPXogpbrY+S2tc8PEonAWpwajLxJLBdfmz7LAJswa/fmGvDtDfvS58w
HQIDAQAB
-----END PUBLIC KEY-----`

; 

zelloToken = jwt.sign(payload, llaveDirecta, { algorithm: 'RS256' });
} catch (err) {
console.error('Error al firmar el token con la Private Key: ' + err.message);
ws.close();
return;
} 

const zelloWs = new WebSocket('wss://zello.page/api/v1/stream?token=' + zelloToken); 

zelloWs.on('open', () => {
console.log('Conexión exitosa con la API de Zello');
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
