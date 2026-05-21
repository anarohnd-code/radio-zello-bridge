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
        const base64Key = process.env.ZELLO_PRIVATE_KEY || LS0tLS1CRUdJTiBQUklWQVRFIEtFWS0tLS0tCk1JSUV2Z0lCQURBTkJna3Foa2lHOXcwQkFRRUZBQVNDQktnd2dnU2tBZ0VBQW9JQkFRRFVhR3BRZUt3VWxUVjgKZDNWdE1DM0hYVW1lbm94d3BReCtLdmhYckZZOTl0YnUrVzdDaDF0VE9idm1QaldrcTBUZkwxN2pSc3RaY3psdAorYUNET2wxVDFiTXBBb0hxaFNPb0xNUEYxQ0MzSnJEbm1wVlVuVEVRZ3VHTUZyczkyc011WHhGQ05mNGRRSi9yClArUXd2U0pTejd5eXZERHg1d3BYNHhsUFJ3SjlrYit3cmhmdWZKVmc5ZWpoY3hlZ3crbnM1MUdTQ0c2NndHUUQKU2RkdTBEb1BuSm12TEF0RlJETnI3ZGlwQmJaYmV6U1Q0ZGZRYlhIc29UZ2QvL3prVkJWbzI1eHJjQmVHR2NUYgpjZE5iQ0dycjluSGFQdHZ6SkNhRklnK0ErTmpURGlhS1BIWlpPRFZXQUh0MVBHNVlVeWN4Z3JmblNtT05UYzRMCjZRRGJLNG5uQWdNQkFBRUNnZ0VBUmdOTTE4Mk8yeEg3bVZVKzdZaXQ3a0wvbXpzamk1Vzdzbkt6ZlNLZklybVUKU3gwSXR6SXFsaG8zcDBMbUo2c1Vmb1I4d0dsN2FiYWpQVzdFeTd5WE9xVDc4dzZTaUJ6dWplYURlVmZjbU1JMgpHWUZJcTZWTW9PYWpOYXZnZUJqOXNQRkJIUlB5K08xdVNQcThXcHhkRGZMUGZoS3VCMjVpYUduQTAvTFNEVlU5CmhodGZaMS9udnhXQThyTSsvNkFWSVdoSU54ZjRTY0phMmY2N1I4aWlESThNTy9HcHVHTlN3TG9yVXhuZWtEMkcKMnZwZnZGRzFxUTM3dW8zdmc5eHpCdHpHNGpoUHZMVS90QVR4ZURJWjhZdkVZdVJwTzh1cGpSRWM2c1BncWFTOApmZVIzbTQ2Z3pLVmpXdUR0bzVSMTFSYkpHbE52T0dQeWFoL1dhU21vOFFLQmdRRHlKWTFlVklHRmw1c3l0Zy9tClp6LzFlWHBVbmV0WU9yblNoQkdWdHpMY3JIZytTWG13c1FUU3cxUlg5bDFDb0d6SEw4NDBQNS82QWUvb3hwSkMKcS9OMnhzKzBUY1RMeEZweUhYcG16aUc0a3BydnJabkl4TFZqL0xySDl0azFYZ3NLZk9acnByTWpOdFlpTW52SQpIRWowU0lmbGtlYU9SY3pkZkNCTTRyN0RVd0tCZ1FEZ2owLzN5UTlpWCtRNk5VcmF1ai9OMk9BS0thYzBNNGlFCk9FOU5tL3JTWXpNN2I1VFpjK0gwMXY4S0ZKb3AvblplZ0JuZExRQ0xvSnNkdEVWN1Ayck5BRlZjVmhhWDJheVkKR2ZIRDhyUklLNlFESUdHMnVDYkpRV0xHdnpxd1R4akxlN1BoeWNxNXJTS2ZPWFZMenFmOG5ZSEFoVUs2UE90QgpUOVdYSFNOQW5RS0JnRjVrS3c1cGJLL3g0RXJOVTdkaDZqbTdaK2RTUStwNXdmUUJEWVhLQ3lhZ2lLTG5LMnVvCkpaUXZGbExQczUwRVFrTUhMSitMYWNZZ09UQUpML3lUWU8yZEpGeEpzSHdxQjRQU1grTnhXUTNGQUdhTHlwWEwKc0ZYUXI5TEJNL3lzc3lzY2N3bmx5cERna0dwMk9YQlJMbE1qYnU0YmlMOVBFRVFLWGVENnhwZ0hBb0dCQUx4cgp3NyszdHU3bVl3dnNWNGk4S25sQWRveFFjdm04RzlwRm5WVVRnaHd5SEhUTXBXcm9iem9QaENRak1VLzNNYjhOCllhWlI4bGsyUTdGaTU4SUlia2JnOXI3cGhUK1k1OWNnUGRvYXRlYXdwNGZ3RGMxUkswcEhVT2hPNEtHN1hLU3cKZ1RqOUp0c3hTUkd0RnB5ckpBMDA1QUIwVUk4UU9wMnNyUjJFMTJXSkFvR0JBTDg1bENYTXpNZk1icURKR1dxUgp6V290cWVReExzdXRCUitmUGxFM2dxc3g4M01INUI2UWgzYUpWUVQyNmNzZ3VLUUtFN1p3MWZKQlRIK0hXK0o2CkMxYWFyZTY5S0xGTVU4aHBtTW56bkJmS0hXYWFwNXVZMG1GLzNBbU1FYUM5VGNVb3RYSkxiZGJqMm51dE9tQmoKSVc2S2NaZ2dRb3NVUjg0UzM0Qkxxc29QCi0tLS0tRU5EIFBSSVZBVEUgS0VZLS0tLS3igKg= ;
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
