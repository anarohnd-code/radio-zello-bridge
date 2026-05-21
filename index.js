const express = require('express');
const jwt = require('jsonwebtoken');

const app = express();
const port = process.env.PORT || 10000;

// Permisos (CORS) para que Blogger pueda pedir la llave sin ser bloqueado
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next();
});

// Pantalla de inicio para verificar que el servidor está vivo
app.get('/', (req, res) => {
    res.send('Fábrica de Llaves de CEDEC RADIO Activa 🚀');
});

// La nueva ruta a la que Blogger llamará para obtener el pase de entrada
app.get('/get-token', (req, res) => {
    const issuerId = process.env.ZELLO_ISSUER;
    const payload = {
        iss: issuerId,
        exp: Math.floor(Date.now() / 1000) + (60 * 60) // El pase dura 1 hora
    };

    try {
        const base64Key = process.env.ZELLO_PRIVATE_KEY || -----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDUaGpQeKwUlTV8
d3VtMC3HXUmenoxwpQx+KvhXrFY99tbu+W7Ch1tTObvmPjWkq0TfL17jRstZczlt
+aCDOl1T1bMpAoHqhSOoLMPF1CC3JrDnmpVUnTEQguGMFrs92sMuXxFCNf4dQJ/r
P+QwvSJSz7yyvDDx5wpX4xlPRwJ9kb+wrhfufJVg9ejhcxegw+ns51GSCG66wGQD
Sddu0DoPnJmvLAtFRDNr7dipBbZbezST4dfQbXHsoTgd//zkVBVo25xrcBeGGcTb
cdNbCGrr9nHaPtvzJCaFIg+A+NjTDiaKPHZZODVWAHt1PG5YUycxgrfnSmONTc4L
6QDbK4nnAgMBAAECggEARgNM182O2xH7mVU+7Yit7kL/mzsji5W7snKzfSKfIrmU
Sx0ItzIqlho3p0LmJ6sUfoR8wGl7abajPW7Ey7yXOqT78w6SiBzujeaDeVfcmMI2
GYFIq6VMoOajNavgeBj9sPFBHRPy+O1uSPq8WpxdDfLPfhKuB25iaGnA0/LSDVU9
hhtfZ1/nvxWA8rM+/6AVIWhINxf4ScJa2f67R8iiDI8MO/GpuGNSwLorUxnekD2G
2vpfvFG1qQ37uo3vg9xzBtzG4jhPvLU/tATxeDIZ8YvEYuRpO8upjREc6sPgqaS8
feR3m46gzKVjWuDto5R11RbJGlNvOGPyah/WaSmo8QKBgQDyJY1eVIGFl5sytg/m
Zz/1eXpUnetYOrnShBGVtzLcrHg+SXmwsQTSw1RX9l1CoGzHL840P5/6Ae/oxpJC
q/N2xs+0TcTLxFpyHXpmziG4kprvrZnIxLVj/LrH9tk1XgsKfOZrprMjNtYiMnvI
HEj0SIflkeaORczdfCBM4r7DUwKBgQDgj0/3yQ9iX+Q6NUrauj/N2OAKKac0M4iE
OE9Nm/rSYzM7b5TZc+H01v8KFJop/nZegBndLQCLoJsdtEV7P2rNAFVcVhaX2ayY
GfHD8rRIK6QDIGG2uCbJQWLGvzqwTxjLe7Phycq5rSKfOXVLzqf8nYHAhUK6POtB
T9WXHSNAnQKBgF5kKw5pbK/x4ErNU7dh6jm7Z+dSQ+p5wfQBDYXKCyagiKLnK2uo
JZQvFlLPs50EQkMHLJ+LacYgOTAJL/yTYO2dJFxJsHwqB4PSX+NxWQ3FAGaLypXL
sFXQr9LBM/yssysccwnlypDgkGp2OXBRLlMjbu4biL9PEEQKXeD6xpgHAoGBALxr
w7+3tu7mYwvsV4i8KnlAdoxQcvm8G9pFnVUTghwyHHTMpWrobzoPhCQjMU/3Mb8N
YaZR8lk2Q7Fi58IIbkbg9r7phT+Y59cgPdoateawp4fwDc1RK0pHUOhO4KG7XKSw
gTj9JtsxSRGtFpyrJA005AB0UI8QOp2srR2E12WJAoGBAL85lCXMzMfMbqDJGWqR
zWotqeQxLsutBR+fPlE3gqsx83MH5B6Qh3aJVQT26csguKQKE7Zw1fJBTH+HW+J6
C1aare69KLFMU8hpmMnznBfKHWaap5uY0mF/3AmMEaC9TcUotXJLbdbj2nutOmBj
IW6KcZggQosUR84S34BLqsoP
-----END PRIVATE KEY----- ;
        const privateKey = Buffer.from(base64Key, 'base64').toString('utf8');
        
        const token = jwt.sign(payload, privateKey, { algorithm: 'RS256' });
        
        // Empaquetamos la llave y se la mandamos a Blogger
        res.json({ success: true, token: token });
        console.log('Se generó y envió un nuevo token a Blogger');
    } catch (err) {
        console.error('Error al firmar la llave:', err.message);
        res.status(500).json({ success: false, error: 'Error interno en la fábrica' });
    }
});

const server = app.listen(port, () => {
    console.log('Fábrica de llaves corriendo en el puerto ' + port);
});
