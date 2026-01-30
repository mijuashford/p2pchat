# P2P Chat minimale (Web/Hybrid)

Chat P2P WebRTC con signaling WebSocket, solo testo, pensata per essere leggera e facilmente estendibile.

## Demo pubblica

- URL: `https://p2pchat-x3s0.onrender.com/`

## Avvio locale

```bash
npm install
npm start
```

Apri `http://localhost:3000`.

## Come funziona (architettura)

### 1) Server di signaling (WebSocket)
Il file `server.js` serve due scopi:
- **Servire i file statici** in `public/`
- **Gestire il signaling** su `/ws`

Il signaling serve solo per la connessione iniziale tra peer:
- gli utenti entrano in una **stanza** con un codice
- il server invia la lista dei peer presenti
- inoltra messaggi “signal” (SDP e ICE candidates)

Dopo il handshake, i messaggi passano **direttamente** tra peer via WebRTC.

### 2) Client WebRTC
Il file `public/app.js`:
- crea connessioni `RTCPeerConnection`
- apre un `DataChannel` per i messaggi
- invia/riceve testo con timestamp e username

Il file `public/index.html` contiene la UI, minimale.

## Modalità d’uso

### A) Modalità server (consigliata)
1) Inserisci **codice stanza** e **username**
2) Entra
3) Condividi il codice stanza con i tuoi amici

Il server di signaling gestisce l’incontro iniziale; la chat è poi P2P.

### B) Modalità manuale (1:1)
Utile senza server di signaling. Si scambia un testo con l’offerta/risposta.

1) Peer A: “Genera offerta (inizio io)”
2) Peer A invia il testo a Peer B
3) Peer B: “Usa offerta e genera risposta”
4) Peer B invia il testo a Peer A
5) Peer A: “Applica risposta”

## Note importanti

- Per uso pubblico serve **HTTPS/WSS** (WebRTC richiede contesto sicuro, eccetto localhost).
- In reti NAT difficili può servire un **TURN server** (non incluso).
- Il server è **leggero**: inoltra solo signaling, non i messaggi della chat.
