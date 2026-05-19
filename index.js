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
    console.log('Servidor corriendo en el puerto ' + port);
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
