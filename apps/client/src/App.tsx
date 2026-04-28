// @ts-nocheck
import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import { io, Socket } from "socket.io-client";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import { appendHistory, readHistory, clearHistory, type HistoryItem } from "./lib/storage";

type Role = "sender" | "receiver" | null;
type ConnectionState = "idle" | "signaling" | "connecting" | "connected" | "transferring" | "done" | "error";
type OutgoingFile = {
  id: string;
  file: File;
  relativePath: string;
  progress: number;
  status: "queued" | "sending" | "paused" | "done" | "canceled";
  transferredBytes: number;
};
type IncomingFile = {
  id: string;
  name: string;
  type: string;
  size: number;
  relativePath: string;
  progress: number;
  status: "queued" | "receiving" | "done";
  transferredBytes: number;
  chunks: Uint8Array[];
  downloadUrl?: string;
};
type FileMeta = {
  id: string;
  name: string;
  size: number;
  type: string;
  relativePath: string;
};
type ControlMessage =
  | { type: "manifest"; files: FileMeta[]; note: string; senderName: string }
  | { type: "transfer-note"; text: string; senderName: string }
  | { type: "text-share"; text: string; senderName: string; createdAt: string }
  | { type: "file-start"; fileId: string }
  | { type: "file-complete"; fileId: string }
  | { type: "transfer-complete" }
  | { type: "pause"; fileId: string }
  | { type: "resume"; fileId: string }
  | { type: "cancel"; fileId: string };

const SIGNAL_URL = import.meta.env.VITE_SIGNAL_SERVER_URL ?? "http://localhost:3001";
const ICE_SERVERS: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];
const CHUNK_SIZE = 256 * 1024;
const BUFFER_HIGH_WATER = 4 * 1024 * 1024;
const BUFFER_LOW_WATER = 1 * 1024 * 1024;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function makeId() {
  return Math.random().toString(36).slice(2, 10);
}

function makeRoomCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function playBeep(frequency = 440, duration = 100) {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    osc.start();
    setTimeout(() => {
      osc.stop();
      ctx.close();
    }, duration);
  } catch (e) {
    // Ignore if audio context fails
  }
}

function formatBytes(bytes: number) {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const power = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** power).toFixed(power === 0 ? 0 : 1)} ${units[power]}`;
}

async function makeQrData(url: string) {
  return QRCode.toDataURL(url, {
    margin: 1,
    color: {
      dark: "#f4f7fb",
      light: "#11151d"
    }
  });
}

function getSelectedFiles(event: ChangeEvent<HTMLInputElement>) {
  const files = Array.from(event.target.files ?? []);
  return files.map((file) => ({
    id: makeId(),
    file,
    relativePath: (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name,
    progress: 0,
    status: "queued" as const,
    transferredBytes: 0
  }));
}

function App() {
  const [role, setRole] = useState<Role>(null);
  const [roomCode, setRoomCode] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [deviceName, setDeviceName] = useState(`Device-${Math.floor(Math.random() * 900 + 100)}`);
  const [peerName, setPeerName] = useState("Waiting for peer");
  const [state, setState] = useState<ConnectionState>("idle");
  const [statusText, setStatusText] = useState("Create a room or join one to start sharing.");
  const [qrData, setQrData] = useState("");
  const [files, setFiles] = useState<OutgoingFile[]>([]);
  const [incoming, setIncoming] = useState<IncomingFile[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>(() => readHistory());
  const [note, setNote] = useState("");
  const [sharedText, setSharedText] = useState("");
  const [receivedTexts, setReceivedTexts] = useState<string[]>([]);
  const [transferSpeed, setTransferSpeed] = useState(0);
  const [etaSeconds, setEtaSeconds] = useState<number | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [selectedIncoming, setSelectedIncoming] = useState<Set<string>>(new Set());

  const socketRef = useRef<Socket | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<RTCDataChannel | null>(null);
  const sendPausedRef = useRef<Record<string, boolean>>({});
  const incomingRef = useRef<Map<string, IncomingFile>>(new Map());
  const activeSendRef = useRef(false);
  const movedBytesRef = useRef(0);
  const totalBytesRef = useRef(0);
  const speedWindowRef = useRef<{ time: number; bytes: number }[]>([]);

  const totalOutgoing = useMemo(() => files.reduce((sum, item) => sum + item.file.size, 0), [files]);
  const sentBytes = useMemo(() => files.reduce((sum, item) => sum + item.transferredBytes, 0), [files]);
  const totalIncoming = useMemo(() => incoming.reduce((sum, item) => sum + item.size, 0), [incoming]);
  const receivedBytes = useMemo(() => incoming.reduce((sum, item) => sum + item.transferredBytes, 0), [incoming]);

  useEffect(() => {
    const socket = io(SIGNAL_URL, {
      transports: ["websocket", "polling"]
    });
    socketRef.current = socket;

    socket.on("room-created", async ({ roomCode: nextCode }: { roomCode: string }) => {
      setRoomCode(nextCode);
      setStatusText("Room ready. Share the code or QR and wait for the receiver.");
      setState("signaling");
      setQrData(await makeQrData(`${window.location.origin}?room=${nextCode}`));
    });

    socket.on("ready", async ({ roomCode: activeCode, peerName: nextPeer }: { roomCode: string; peerName: string }) => {
      setRoomCode(activeCode);
      setPeerName(nextPeer);
      setState("connecting");
      setStatusText("Peer detected. Building the direct lane.");
      playBeep(880, 150);
      await ensurePeerConnection(role === "sender", activeCode);
    });

    socket.on("signal", async ({ payload }: { payload: RTCSessionDescriptionInit | RTCIceCandidateInit }) => {
      const peer = peerRef.current;
      if (!peer) return;
      if ("type" in payload) {
        await peer.setRemoteDescription(payload);
        if (payload.type === "offer") {
          const answer = await peer.createAnswer();
          await peer.setLocalDescription(answer);
          socket.emit("signal", { roomCode: roomCode || joinCode.toUpperCase(), payload: answer });
        }
      } else if (payload.candidate) {
        await peer.addIceCandidate(payload).catch(() => undefined);
      }
    });

    socket.on("peer-left", () => {
      setState("idle");
      setPeerName("Waiting for peer");
      setStatusText("The other device left. Reuse the room or create a new one.");
      activeSendRef.current = false;
    });

    socket.on("error", ({ message }: { message: string }) => {
      setState("error");
      setStatusText(message);
    });

    const params = new URLSearchParams(window.location.search);
    const prefilled = params.get("room");
    if (prefilled) {
      setJoinCode(prefilled.toUpperCase());
    }

    return () => {
      socket.disconnect();
      channelRef.current?.close();
      peerRef.current?.close();
    };
  }, [joinCode, role, roomCode]);

  function updateSpeed(bytes: number) {
    const now = Date.now();
    movedBytesRef.current += bytes;
    speedWindowRef.current.push({ time: now, bytes });
    speedWindowRef.current = speedWindowRef.current.filter((point) => now - point.time <= 1500);
    const total = speedWindowRef.current.reduce((sum, point) => sum + point.bytes, 0);
    const duration = Math.max((now - speedWindowRef.current[0].time) / 1000, 0.3);
    const speed = total / duration;
    setTransferSpeed(speed);
    const pending = Math.max(totalBytesRef.current - movedBytesRef.current, 0);
    setEtaSeconds(speed > 0 ? Math.ceil(pending / speed) : null);
  }

  async function ensurePeerConnection(isInitiator: boolean, activeCode: string) {
    if (peerRef.current) return;
    const peer = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    peerRef.current = peer;

    peer.onicecandidate = (event) => {
      if (event.candidate) {
        socketRef.current?.emit("signal", { roomCode: activeCode, payload: event.candidate.toJSON() });
      }
    };

    peer.onconnectionstatechange = () => {
      if (peer.connectionState === "connected") {
        setState("connected");
        setStatusText("Direct lane ready. Files can move now.");
      }
      if (peer.connectionState === "failed") {
        setState("error");
        setStatusText("Direct connection failed. Try again on the same Wi-Fi or hotspot.");
      }
    };

    peer.ondatachannel = (event) => {
      setupChannel(event.channel);
    };

    if (isInitiator) {
      const channel = peer.createDataChannel("transfer", { ordered: true });
      setupChannel(channel);
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      socketRef.current?.emit("signal", { roomCode: activeCode, payload: offer });
    }
  }

  function setupChannel(channel: RTCDataChannel) {
    channelRef.current = channel;
    channel.binaryType = "arraybuffer";
    channel.bufferedAmountLowThreshold = BUFFER_LOW_WATER;

    const onOpen = () => {
      setState("connected");
      setStatusText("Peer locked in. Files will move directly device to device.");
    };

    channel.onopen = onOpen;
    if (channel.readyState === "open") {
      onOpen();
    }

    channel.onmessage = (event) => {
      if (typeof event.data === "string") {
        handleControlMessage(JSON.parse(event.data) as ControlMessage);
        return;
      }

      const bytes = new Uint8Array(event.data as ArrayBuffer);
      const idLength = bytes[0];
      const fileId = decoder.decode(bytes.slice(1, idLength + 1));
      const chunk = bytes.slice(idLength + 1);
      const file = incomingRef.current.get(fileId);
      if (!file) return;

      file.chunks.push(chunk);
      file.transferredBytes += chunk.byteLength;
      file.progress = Math.min((file.transferredBytes / file.size) * 100, 100);
      file.status = "receiving";
      updateSpeed(chunk.byteLength);
      setIncoming((current) => current.map((entry) => (entry.id === fileId ? { ...file } : entry)));
    };
  }

  function handleControlMessage(message: ControlMessage) {
    if (message.type === "manifest") {
      const items = message.files.map<IncomingFile>((file) => ({
        id: file.id,
        name: file.name,
        type: file.type,
        size: file.size,
        relativePath: file.relativePath,
        progress: 0,
        status: "queued",
        transferredBytes: 0,
        chunks: []
      }));
      incomingRef.current = new Map(items.map((item) => [item.id, item]));
      totalBytesRef.current = items.reduce((sum, item) => sum + item.size, 0);
      movedBytesRef.current = 0;
      setPeerName(message.senderName);
      setIncoming(items);
      setSelectedIncoming(new Set(items.map(item => item.id)));
      setNote(message.note);
      setStatusText(`Incoming batch ready: ${items.length} item(s) from ${message.senderName}.`);
    }

    if (message.type === "transfer-note") {
      setNote(message.text);
    }

    if (message.type === "text-share") {
      setReceivedTexts((current) => [`${message.senderName}: ${message.text}`, ...current].slice(0, 6));
    }

    if (message.type === "file-start") {
      setState("transferring");
    }

    if (message.type === "file-complete") {
      const file = incomingRef.current.get(message.fileId);
      if (!file) return;
      file.progress = 100;
      file.status = "done";
      file.downloadUrl = URL.createObjectURL(new Blob(file.chunks, { type: file.type || "application/octet-stream" }));
      setIncoming((current) => current.map((entry) => (entry.id === file.id ? { ...file } : entry)));
    }

    if (message.type === "pause") {
      setFiles((current) => current.map((item) => (item.id === message.fileId && item.status === "sending" ? { ...item, status: "paused" } : item)));
    }

    if (message.type === "resume") {
      sendPausedRef.current[message.fileId] = false;
      void sendQueuedFiles();
    }

    if (message.type === "cancel") {
      sendPausedRef.current[message.fileId] = true;
      setFiles((current) => current.map((item) => (item.id === message.fileId ? { ...item, status: "canceled" } : item)));
    }

    if (message.type === "transfer-complete") {
      setState("done");
      setStatusText("Transfer finished. Everything is ready to save.");
      playBeep(523, 100);
      setTimeout(() => playBeep(659, 150), 150);
      const items = Array.from(incomingRef.current.values());
      appendHistory({
        id: makeId(),
        roomCode,
        direction: role === "sender" ? "sent" : "received",
        names: items.length ? items.map((item) => item.name) : files.map((file) => file.file.name),
        totalBytes: items.length ? items.reduce((sum, item) => sum + item.size, 0) : totalOutgoing,
        createdAt: new Date().toISOString(),
        peerLabel: peerName
      });
      setHistory(readHistory());
      activeSendRef.current = false;
    }
  }

  function createRoom() {
    setRole("sender");
    socketRef.current?.emit("create-room", { roomCode: makeRoomCode(), peerName: deviceName });
  }

  function joinRoom() {
    const activeCode = joinCode.trim().toUpperCase();
    if (!activeCode) return;
    setRole("receiver");
    setRoomCode(activeCode);
    setState("signaling");
    setStatusText("Joining room and waiting for the sender handshake.");
    socketRef.current?.emit("join-room", { roomCode: activeCode, peerName: deviceName });
  }

  function onPickFiles(event: ChangeEvent<HTMLInputElement>) {
    setFiles((current) => [...current, ...getSelectedFiles(event)]);
    event.target.value = "";
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setDragActive(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    setDragActive(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const newFiles = Array.from(e.dataTransfer.files).map((file) => ({
        id: makeId(),
        file,
        relativePath: file.webkitRelativePath || file.name,
        progress: 0,
        status: "queued" as const,
        transferredBytes: 0
      }));
      setFiles((current) => [...current, ...newFiles]);
    }
  }

  function downloadSelected() {
    const targets = incoming.filter(f => selectedIncoming.has(f.id) && f.status === "done" && f.downloadUrl);
    targets.forEach((file) => {
      const a = document.createElement("a");
      a.href = file.downloadUrl!;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    });
  }

  function toggleSelection(id: string) {
    setSelectedIncoming((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIncoming.size === incoming.length) {
      setSelectedIncoming(new Set());
    } else {
      setSelectedIncoming(new Set(incoming.map(f => f.id)));
    }
  }

  function handleClearHistory() {
    clearHistory();
    setHistory([]);
  }

  function pauseFile(fileId: string) {
    sendPausedRef.current[fileId] = true;
    channelRef.current?.send(JSON.stringify({ type: "pause", fileId } satisfies ControlMessage));
    setFiles((current) => current.map((item) => (item.id === fileId ? { ...item, status: "paused" } : item)));
  }

  function resumeFile(fileId: string) {
    sendPausedRef.current[fileId] = false;
    channelRef.current?.send(JSON.stringify({ type: "resume", fileId } satisfies ControlMessage));
    setFiles((current) => current.map((item) => (item.id === fileId ? { ...item, status: "queued" } : item)));
    void sendQueuedFiles();
  }

  function cancelFile(fileId: string) {
    sendPausedRef.current[fileId] = true;
    channelRef.current?.send(JSON.stringify({ type: "cancel", fileId } satisfies ControlMessage));
    setFiles((current) => current.map((item) => (item.id === fileId ? { ...item, status: "canceled" } : item)));
  }

  async function sendText() {
    if (!sharedText.trim() || !channelRef.current) return;
    channelRef.current.send(JSON.stringify({
      type: "text-share",
      text: sharedText.trim(),
      senderName: deviceName,
      createdAt: new Date().toISOString()
    } satisfies ControlMessage));
    setReceivedTexts((current) => [`You: ${sharedText.trim()}`, ...current].slice(0, 6));
    setSharedText("");
  }

  async function waitForBuffer(channel: RTCDataChannel) {
    if (channel.bufferedAmount <= BUFFER_HIGH_WATER) return;
    await new Promise<void>((resolve) => {
      const onLow = () => {
        channel.removeEventListener("bufferedamountlow", onLow);
        resolve();
      };
      channel.addEventListener("bufferedamountlow", onLow);
    });
  }

  async function waitWhilePaused(fileId: string) {
    if (!sendPausedRef.current[fileId]) return;
    await new Promise<void>((resolve) => {
      const timer = window.setInterval(() => {
        if (!sendPausedRef.current[fileId]) {
          window.clearInterval(timer);
          resolve();
        }
      }, 120);
    });
  }

  async function sendQueuedFiles() {
    const channel = channelRef.current;
    if (!channel || channel.readyState !== "open" || activeSendRef.current) return;
    const activeFiles = files.filter((file) => file.status !== "canceled" && file.status !== "done");
    if (activeFiles.length === 0) return;

    activeSendRef.current = true;
    totalBytesRef.current = activeFiles.reduce((sum, file) => sum + (file.file.size - file.transferredBytes), 0);
    movedBytesRef.current = 0;
    speedWindowRef.current = [];

    channel.send(JSON.stringify({
      type: "manifest",
      files: files.filter((file) => file.status !== "canceled").map<FileMeta>((file) => ({
        id: file.id,
        name: file.file.name,
        size: file.file.size,
        type: file.file.type,
        relativePath: file.relativePath
      })),
      note,
      senderName: deviceName
    } satisfies ControlMessage));

    if (note.trim()) {
      channel.send(JSON.stringify({ type: "transfer-note", text: note.trim(), senderName: deviceName } satisfies ControlMessage));
    }

    setState("transferring");

    for (const item of activeFiles) {
      channel.send(JSON.stringify({ type: "file-start", fileId: item.id } satisfies ControlMessage));
      setFiles((current) => current.map((file) => (file.id === item.id ? { ...file, status: "sending" } : file)));

      let offset = item.transferredBytes;
      while (offset < item.file.size) {
        if (sendPausedRef.current[item.id]) {
          await waitWhilePaused(item.id);
        }

        await waitForBuffer(channel);

        const slice = item.file.slice(offset, offset + CHUNK_SIZE);
        const bytes = new Uint8Array(await slice.arrayBuffer());
        const idBytes = encoder.encode(item.id);
        const packet = new Uint8Array(1 + idBytes.length + bytes.length);
        packet[0] = idBytes.length;
        packet.set(idBytes, 1);
        packet.set(bytes, 1 + idBytes.length);
        channel.send(packet);

        offset += bytes.byteLength;
        updateSpeed(bytes.byteLength);
        setFiles((current) =>
          current.map((file) =>
            file.id === item.id
              ? {
                  ...file,
                  transferredBytes: offset,
                  progress: Math.min((offset / file.file.size) * 100, 100),
                  status: offset >= file.file.size ? "done" : "sending"
                }
              : file
          )
        );
      }

      channel.send(JSON.stringify({ type: "file-complete", fileId: item.id } satisfies ControlMessage));
    }

    channel.send(JSON.stringify({ type: "transfer-complete" } satisfies ControlMessage));
    setState("done");
    setStatusText("Batch sent. The receiver can save each finished item instantly.");
    playBeep(523, 100);
    setTimeout(() => playBeep(659, 150), 150);
    appendHistory({
      id: makeId(),
      roomCode,
      direction: "sent",
      names: files.filter((file) => file.status !== "canceled").map((file) => file.file.name),
      totalBytes: files.filter((file) => file.status !== "canceled").reduce((sum, file) => sum + file.file.size, 0),
      createdAt: new Date().toISOString(),
      peerLabel: peerName
    });
    setHistory(readHistory());
    activeSendRef.current = false;
  }

  return (
    <div className="shell">
      <section className="hero">
        <div>
          <span className="eyebrow">PeerDash</span>
          <h1>Faster direct file transfer with an InShare-style room flow.</h1>
          <p>
            Send files, folders, text snippets, and quick notes between devices with QR join,
            chunked WebRTC streaming, queue controls, and local transfer history.
          </p>
        </div>
        <div className="hero-card">
          <div className="status-pill">{state.toUpperCase()}</div>
          <h2>{roomCode ? `Room ${roomCode}` : "No active room yet"}</h2>
          <p>{statusText}</p>
          <div className="metrics">
            <div>
              <strong>{formatBytes(transferSpeed)}/s</strong>
              <span>Live speed</span>
            </div>
            <div>
              <strong>{etaSeconds ? `${etaSeconds}s` : "--"}</strong>
              <span>ETA</span>
            </div>
            <div>
              <strong>{role === "sender" ? formatBytes(sentBytes) : formatBytes(receivedBytes)}</strong>
              <span>Moved now</span>
            </div>
          </div>
        </div>
      </section>

      <section className="grid two">
        <div className="panel">
          <h3>Connect devices</h3>
          <label className="field">
            <span>Device name</span>
            <input value={deviceName} onChange={(event) => setDeviceName(event.target.value)} />
          </label>
          <div className="actions">
            <button className="primary" onClick={createRoom}>Create sender room</button>
            <button onClick={joinRoom}>Join as receiver</button>
          </div>
          <label className="field">
            <span>Join code</span>
            <input value={joinCode} onChange={(event) => setJoinCode(event.target.value.toUpperCase())} placeholder="ABC123" />
          </label>
          {qrData ? <img className="qr" src={qrData} alt="Room QR" /> : null}
          <p className="muted">Peer: {peerName}</p>
        </div>

        <div className="panel">
          <h3>Quick share tools</h3>
          <label className="field">
            <span>Transfer note</span>
            <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} placeholder="Example: drop these in your downloads folder" />
          </label>
          <label className="field">
            <span>Clipboard or text share</span>
            <textarea value={sharedText} onChange={(event) => setSharedText(event.target.value)} rows={3} placeholder="Paste a link, password, or short note" />
          </label>
          <div className="actions">
            <button onClick={sendText} disabled={state !== "connected" && state !== "transferring"}>Send text</button>
            <button onClick={() => navigator.clipboard.writeText(roomCode)} disabled={!roomCode}>Copy room code</button>
          </div>
          <div className="chip-list">
            {receivedTexts.length === 0 ? <span className="muted">No quick text shared yet.</span> : null}
            {receivedTexts.map((item) => (
              <span className="chip" key={item}>{item}</span>
            ))}
          </div>
        </div>
      </section>

      <section className="grid two">
        <div className={`panel ${dragActive ? "drag-active" : ""}`} onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
          <div className="panel-head">
            <div>
              <h3>Send queue</h3>
              <p>{files.length} items · {formatBytes(totalOutgoing)}</p>
            </div>
            <div className="actions">
              <label className="button-like">
                Add files
                <input type="file" multiple onChange={onPickFiles} hidden />
              </label>
              <label className="button-like">
                Add folder
                <input type="file" multiple webkitdirectory="" onChange={onPickFiles} hidden />
              </label>
              <button className="primary" onClick={sendQueuedFiles} disabled={files.length === 0 || state === "idle" || state === "signaling"}>
                Start transfer
              </button>
            </div>
          </div>
          <div className="list">
            {files.length === 0 ? <p className="muted">Pick files or a folder to build the transfer batch.</p> : null}
            {files.map((file) => {
              const isImage = file.file.type.startsWith("image/");
              const thumbUrl = isImage ? URL.createObjectURL(file.file) : null;
              return (
              <article key={file.id} className="row">
                <div className="row-info">
                  {thumbUrl ? <img src={thumbUrl} className="thumb" alt="preview" /> : null}
                  <div>
                    <strong>{file.relativePath}</strong>
                    <p>{formatBytes(file.file.size)} · {file.status}</p>
                  </div>
                </div>
                <div className="row-actions">
                  <progress max={100} value={file.progress} />
                  {file.status === "sending" ? <button onClick={() => pauseFile(file.id)}>Pause</button> : null}
                  {file.status === "paused" ? <button onClick={() => resumeFile(file.id)}>Resume</button> : null}
                  {file.status !== "done" && file.status !== "canceled" ? <button onClick={() => cancelFile(file.id)}>Cancel</button> : null}
                </div>
              </article>
            )})}
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <div>
              <h3>Receiver inbox</h3>
              <p>{incoming.length} items · {formatBytes(totalIncoming)}</p>
            </div>
            <div className="actions">
              <button onClick={toggleSelectAll} disabled={incoming.length === 0}>
                {selectedIncoming.size === incoming.length && incoming.length > 0 ? "Deselect All" : "Select All"}
              </button>
              <button className="primary" onClick={downloadSelected} disabled={selectedIncoming.size === 0 || !incoming.some(f => selectedIncoming.has(f.id) && f.status === "done")}>
                Download Selected
              </button>
            </div>
          </div>
          <div className="list">
            {incoming.length === 0 ? <p className="muted">Incoming files appear here after the sender shares the manifest.</p> : null}
            {incoming.map((file) => {
              const isImage = file.type.startsWith("image/");
              return (
              <article key={file.id} className="row">
                <div className="row-info">
                  <input type="checkbox" checked={selectedIncoming.has(file.id)} onChange={() => toggleSelection(file.id)} />
                  {isImage && file.downloadUrl ? <img src={file.downloadUrl} className="thumb" alt="preview" /> : null}
                  <div>
                    <strong>{file.relativePath}</strong>
                    <p>{formatBytes(file.size)} · {file.status}</p>
                  </div>
                </div>
                <div className="row-actions">
                  <progress max={100} value={file.progress} />
                  {file.downloadUrl ? <a className="download" href={file.downloadUrl} download={file.name}>Save</a> : null}
                </div>
              </article>
            )})}
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <div>
            <h3>Recent transfer history</h3>
            <p>Local to this device for repeat sends and transfer checks.</p>
          </div>
          <div className="actions">
            <button onClick={handleClearHistory} disabled={history.length === 0}>Clear history</button>
          </div>
        </div>
        <div className="list">
          {history.length === 0 ? <p className="muted">No transfer history yet.</p> : null}
          {history.map((item) => (
            <article key={item.id} className="row">
              <div>
                <strong>{item.direction === "sent" ? "Sent" : "Received"} · {item.peerLabel}</strong>
                <p>{item.names.join(", ")} · {formatBytes(item.totalBytes)}</p>
              </div>
              <div>
                <span className="chip">{item.roomCode}</span>
                <span className="muted">{new Date(item.createdAt).toLocaleString()}</span>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

export default App;
