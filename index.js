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
        const base64Key = process.env.ZELLO_PRIVATE_KEY || '';
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
