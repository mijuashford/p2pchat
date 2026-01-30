const joinEl = document.getElementById("join");
const chatEl = document.getElementById("chat");
const roomInput = document.getElementById("room");
const userInput = document.getElementById("username");
const joinBtn = document.getElementById("joinBtn");
const leaveBtn = document.getElementById("leaveBtn");
const roomLabel = document.getElementById("roomLabel");
const roomLabelWrap = document.getElementById("roomLabelWrap");
const peersEl = document.getElementById("peers");
const messagesEl = document.getElementById("messages");
const form = document.getElementById("form");
const messageInput = document.getElementById("message");
const modeInputs = document.querySelectorAll("input[name='mode']");
const manualPanel = document.getElementById("manualPanel");
const createOfferBtn = document.getElementById("createOfferBtn");
const useOfferBtn = document.getElementById("useOfferBtn");
const applyAnswerBtn = document.getElementById("applyAnswerBtn");
const localSignal = document.getElementById("localSignal");
const remoteSignal = document.getElementById("remoteSignal");

let ws;
let myId = null;
let myName = null;
let roomCode = null;
let mode = "server";
let manualPeer = null;

const peers = new Map();
// peerId -> { username, pc, dc }

const rtcConfig = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" }
  ]
};

joinBtn.addEventListener("click", joinRoom);
form.addEventListener("submit", onSend);
leaveBtn.addEventListener("click", leaveRoom);
createOfferBtn.addEventListener("click", createManualOffer);
useOfferBtn.addEventListener("click", useManualOffer);
applyAnswerBtn.addEventListener("click", applyManualAnswer);
modeInputs.forEach((input) => {
  input.addEventListener("change", () => {
    mode = document.querySelector("input[name='mode']:checked")?.value || "server";
    updateModeUI();
  });
});

updateModeUI();

function joinRoom() {
  const username = userInput.value.trim();
  if (!username) return;

  myName = username;

  if (mode === "manual") {
    roomCode = roomInput.value.trim() || "Manuale";
    showChat();
    manualPanel.classList.remove("hidden");
    peersEl.textContent = "Modalità manuale (1:1)";
    return;
  }

  const room = roomInput.value.trim();
  if (!room) return;
  roomCode = room;

  ws = new WebSocket(getWsUrl());
  ws.addEventListener("open", () => {
    sendWs({ type: "join", room, username });
  });
  ws.addEventListener("message", (event) => {
    const msg = JSON.parse(event.data);
    handleSignal(msg);
  });
  ws.addEventListener("close", () => {
    systemMessage("Connessione al server chiusa.");
  });
}

function getWsUrl() {
  const protocol = location.protocol === "https:" ? "wss" : "ws";
  return `${protocol}://${location.host}/ws`;
}

function handleSignal(msg) {
  if (msg.type === "joined") {
    myId = msg.id;
    showChat();
    msg.peers.forEach((p) => createPeer(p.id, p.username, true));
    renderPeers();
    return;
  }

  if (msg.type === "peer-joined") {
    createPeer(msg.id, msg.username, false);
    renderPeers();
    return;
  }

  if (msg.type === "peer-left") {
    const peer = peers.get(msg.id);
    if (peer?.dc) peer.dc.close();
    if (peer?.pc) peer.pc.close();
    peers.delete(msg.id);
    renderPeers();
    systemMessage("Un peer ha lasciato la stanza.");
    return;
  }

  if (msg.type === "signal") {
    onSignal(msg.from, msg.data);
    return;
  }

  if (msg.type === "error") {
    systemMessage(msg.message || "Errore.");
  }
}

function createPeer(id, username, isInitiator) {
  if (peers.has(id)) return;

  const pc = new RTCPeerConnection(rtcConfig);
  const peer = { username, pc, dc: null };
  peers.set(id, peer);

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      sendWs({ type: "signal", to: id, data: { candidate: event.candidate } });
    }
  };

  pc.ondatachannel = (event) => {
    setupDataChannel(id, event.channel);
  };

  if (isInitiator) {
    const dc = pc.createDataChannel("chat");
    setupDataChannel(id, dc);
    pc.createOffer()
      .then((offer) => pc.setLocalDescription(offer))
      .then(() => {
        sendWs({ type: "signal", to: id, data: { sdp: pc.localDescription } });
      });
  }
}

function setupDataChannel(peerId, dc) {
  const peer = peers.get(peerId);
  if (!peer) return;
  peer.dc = dc;

  dc.onopen = () => {
    systemMessage(`Connesso a ${peer.username}`);
  };

  dc.onmessage = (event) => {
    const payload = JSON.parse(event.data);
    addMessage(payload.text, payload.username, false, payload.timestamp);
  };

  dc.onclose = () => {
    systemMessage(`Connessione chiusa con ${peer.username}`);
  };
}

async function onSignal(from, data) {
  const peer = peers.get(from);
  if (!peer) return;
  const pc = peer.pc;

  if (data.sdp) {
    await pc.setRemoteDescription(data.sdp);
    if (data.sdp.type === "offer") {
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      sendWs({ type: "signal", to: from, data: { sdp: pc.localDescription } });
    }
  }

  if (data.candidate) {
    try {
      await pc.addIceCandidate(data.candidate);
    } catch (err) {
      console.warn(err);
    }
  }
}

function onSend(event) {
  event.preventDefault();
  const text = messageInput.value.trim();
  if (!text) return;

  const payload = {
    text,
    username: myName,
    timestamp: Date.now()
  };

  addMessage(text, myName, true, payload.timestamp);
  broadcastData(payload);
  messageInput.value = "";
}

function broadcastData(payload) {
  const data = JSON.stringify(payload);
  for (const peer of peers.values()) {
    if (peer.dc && peer.dc.readyState === "open") {
      peer.dc.send(data);
    }
  }
}

function addMessage(text, username, isMe, timestamp) {
  const item = document.createElement("div");
  item.className = `message ${isMe ? "me" : ""}`;
  const time = new Date(timestamp).toLocaleTimeString();
  item.innerHTML = `
    <div class="meta">${escapeHtml(username)} · ${time}</div>
    <div>${escapeHtml(text)}</div>
  `;
  messagesEl.appendChild(item);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function systemMessage(text) {
  const item = document.createElement("div");
  item.className = "message";
  item.innerHTML = `<div class="meta">Sistema</div><div>${escapeHtml(text)}</div>`;
  messagesEl.appendChild(item);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function renderPeers() {
  const names = Array.from(peers.values()).map((p) => p.username);
  peersEl.textContent = names.length ? `Peer: ${names.join(", ")}` : "Nessun peer connesso";
}

function showChat() {
  joinEl.classList.add("hidden");
  chatEl.classList.remove("hidden");
  roomLabel.textContent = `Stanza: ${roomCode}`;
}

function leaveRoom() {
  for (const peer of peers.values()) {
    peer.dc?.close();
    peer.pc?.close();
  }
  peers.clear();
  ws?.close();
  manualPeer?.dc?.close();
  manualPeer?.pc?.close();
  manualPeer = null;
  localSignal.value = "";
  remoteSignal.value = "";
  manualPanel.classList.add("hidden");
  myId = null;
  roomCode = null;
  myName = null;
  messagesEl.innerHTML = "";
  joinEl.classList.remove("hidden");
  chatEl.classList.add("hidden");
}

function sendWs(payload) {
  ws.send(JSON.stringify(payload));
}

function escapeHtml(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#039;");
}

function updateModeUI() {
  const isManual = mode === "manual";
  roomLabelWrap.classList.toggle("hidden", isManual);
}

function ensureManualPeer() {
  if (manualPeer) return manualPeer;

  const pc = new RTCPeerConnection(rtcConfig);
  manualPeer = { username: "peer", pc, dc: null };

  pc.onicecandidate = () => {};
  pc.ondatachannel = (event) => {
    setupManualDataChannel(event.channel);
  };

  return manualPeer;
}

function setupManualDataChannel(dc) {
  manualPeer.dc = dc;
  dc.onopen = () => systemMessage("Connessione P2P attiva.");
  dc.onmessage = (event) => {
    const payload = JSON.parse(event.data);
    addMessage(payload.text, payload.username, false, payload.timestamp);
  };
  dc.onclose = () => systemMessage("Connessione P2P chiusa.");
}

async function createManualOffer() {
  const peer = ensureManualPeer();
  const dc = peer.pc.createDataChannel("chat");
  setupManualDataChannel(dc);

  const offer = await peer.pc.createOffer();
  await peer.pc.setLocalDescription(offer);
  await waitForIceComplete(peer.pc);

  setLocalSignal(buildSignalPayload(peer.pc.localDescription));
  systemMessage("Offerta generata. Condividila con l'altro peer.");
}

async function useManualOffer() {
  const peer = ensureManualPeer();
  const remote = parseSignal(remoteSignal.value);
  if (!remote?.sdp || remote.sdp.type !== "offer") {
    systemMessage("Segnale remoto non valido (serve un'offerta).");
    return;
  }

  peer.username = remote.username || "peer";
  await peer.pc.setRemoteDescription(remote.sdp);
  const answer = await peer.pc.createAnswer();
  await peer.pc.setLocalDescription(answer);
  await waitForIceComplete(peer.pc);

  setLocalSignal(buildSignalPayload(peer.pc.localDescription));
  renderManualPeer();
  systemMessage("Risposta generata. Inviala al peer che ha creato l'offerta.");
}

async function applyManualAnswer() {
  if (!manualPeer) return;
  const remote = parseSignal(remoteSignal.value);
  if (!remote?.sdp || remote.sdp.type !== "answer") {
    systemMessage("Segnale remoto non valido (serve una risposta).");
    return;
  }

  manualPeer.username = remote.username || "peer";
  await manualPeer.pc.setRemoteDescription(remote.sdp);
  renderManualPeer();
  systemMessage("Risposta applicata. Attendi la connessione.");
}

function renderManualPeer() {
  const name = manualPeer?.username || "peer";
  peersEl.textContent = `Peer: ${name}`;
}

function buildSignalPayload(desc) {
  return JSON.stringify({ username: myName, sdp: desc });
}

function parseSignal(text) {
  try {
    return JSON.parse(text.trim());
  } catch {
    return null;
  }
}

function setLocalSignal(text) {
  localSignal.value = text;
}

function waitForIceComplete(pc) {
  if (pc.iceGatheringState === "complete") return Promise.resolve();
  return new Promise((resolve) => {
    const onStateChange = () => {
      if (pc.iceGatheringState === "complete") {
        pc.removeEventListener("icegatheringstatechange", onStateChange);
        resolve();
      }
    };
    pc.addEventListener("icegatheringstatechange", onStateChange);
  });
}
