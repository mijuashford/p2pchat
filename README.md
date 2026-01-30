# P2P Chat minimale (Web/Hybrid)

Chat P2P WebRTC con signaling WebSocket, solo testo.

## Avvio

```bash
npm install
npm start
```

Apri `http://localhost:3000`.

## Note

- Funziona via internet se il server di signaling è raggiungibile pubblicamente.
- Per uso pubblico serve HTTPS/WSS (WebRTC richiede contesto sicuro, eccetto localhost).
- Per reti NAT difficili potrebbe servire un TURN server (non incluso).
- Codice semplice e modulare: `public/app.js` è il client; `server.js` è il signaling.

## Modalità manuale

Dal client puoi scegliere **Manuale** per uno scambio 1:1 senza server di signaling:
- Un peer genera l’offerta e la condivide (QR o testo).
- L’altro peer usa l’offerta e genera la risposta.
- Il primo peer applica la risposta.
