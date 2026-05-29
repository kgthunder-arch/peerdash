import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import { io, Socket } from "socket.io-client";
import Peer, { DataConnection } from "peerjs";
import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory } from "@capacitor/filesystem";
import JSZip from "jszip";

import { appendHistory, readHistory, clearHistory, getDeviceName, setDeviceName, type HistoryItem } from "./lib/storage";
import { generateSessionKey, encryptChunk, decryptChunk, exportSessionKey, importSessionKey } from "./lib/transferEncryption";
import { LanDiscovery, type LanPeer } from "./lib/lanDiscovery";
import { useAuthStore } from "./store/auth";
import { useSubscriptionStore } from "./store/subscription";
import { LoginScreen } from "./components/LoginScreen";
import { UserHeader } from "./components/UserHeader";
import { EncryptionBadge } from "./components/EncryptionBadge";
import { showToast, showBrowserNotification } from "./components/NotificationToast";

// ─── Types ────────────────────────────────────────────────────────────────────

type Role = "sender" | "receiver" | null;
type ConnectionState = "idle" | "signaling" | "connecting" | "connected" | "transferring" | "done" | "error";

type OutgoingFile = {
  id: string; file: File; relativePath: string;
  progress: number; status: "queued" | "sending" | "paused" | "done" | "canceled";
  transferredBytes: number;
};
type IncomingFile = {
  id: string; name: string; type: string; size: number; relativePath: string;
  progress: number; status: "queued" | "receiving" | "done" | "canceled";
  transferredBytes: number; chunks: Uint8Array[]; downloadUrl?: string; opfsHandle?: any;
};
type FileMeta = { id: string; name: string; size: number; type: string; relativePath: string };

type ControlMessage =
  | { type: "manifest"; files: FileMeta[]; note: string; senderName: string }
  | { type: "transfer-note"; text: string; senderName: string }
  | { type: "text-share"; text: string; senderName: string; createdAt: string }
  | { type: "file-start"; fileId: string }
  | { type: "file-complete"; fileId: string }
  | { type: "transfer-complete" }
  | { type: "pause"; fileId: string }
  | { type: "resume"; fileId: string }
  | { type: "cancel"; fileId: string }
  | { type: "transfer-cancel"; senderName: string }
  | { type: "peer-leave"; peerName: string }
  | { type: "session-key"; key: string }
  | { type: "chat"; text: string; senderName: string; createdAt: string };

type ChatMessage = { id: string; sender: string; text: string; createdAt: string; own: boolean };
type DeferredInstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};
type AppSection = "connect" | "send" | "receive" | "tools" | "history" | "chat";

// ─── Constants ────────────────────────────────────────────────────────────────

const SIGNAL_URL = import.meta.env.VITE_SIGNAL_SERVER_URL ?? (import.meta.env.DEV ? "http://localhost:3001" : "");
const PEER_PREFIX = "pd";
const DEFAULT_ICE: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:openrelay.metered.ca:80" },
  { urls: "turn:openrelay.metered.ca:80", username: "openrelayproject", credential: "openrelayproject" },
  { urls: "turn:openrelay.metered.ca:443", username: "openrelayproject", credential: "openrelayproject" },
  { urls: "turn:openrelay.metered.ca:443?transport=tcp", username: "openrelayproject", credential: "openrelayproject" },
];
const PEER_OPTIONS = { host: "0.peerjs.com", port: 443, path: "/", secure: true, config: { iceServers: DEFAULT_ICE } };
const QR_READER_ID = "peerdash-qr-reader";
const RELAY_CHUNK = 256 * 1024;
const SAFARI_CHUNK = 512 * 1024;
const DIRECT_CHUNK = 1024 * 1024;
const BUF_HIGH = 32 * 1024 * 1024;
const BUF_LOW = 8 * 1024 * 1024;
const PROGRESS_INTERVAL = 160;
const enc = new TextEncoder();
const dec = new TextDecoder();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeId() { return Math.random().toString(36).slice(2, 10); }
function makeRoomCode() { return Math.random().toString(36).slice(2, 8).toUpperCase(); }

function playBeep(freq = 440, dur = 100, muted = false) {
  if (muted) return;
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator(); const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.frequency.value = freq; gain.gain.setValueAtTime(0.1, ctx.currentTime);
    osc.start(); setTimeout(() => { osc.stop(); ctx.close(); }, dur);
  } catch { /* ignore */ }
}

function formatBytes(b: number) {
  if (b === 0) return "0 B";
  const u = ["B", "KB", "MB", "GB"]; const p = Math.min(Math.floor(Math.log(b) / Math.log(1024)), u.length - 1);
  return `${(b / 1024 ** p).toFixed(p === 0 ? 0 : 1)} ${u[p]}`;
}

async function makeQrData(url: string) {
  return QRCode.toDataURL(url, { margin: 1, color: { dark: "#f4f7fb", light: "#11151d" } });
}

function getSelectedFiles(e: ChangeEvent<HTMLInputElement>) {
  return Array.from(e.target.files ?? []).map(f => ({
    id: makeId(), file: f,
    relativePath: (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name,
    progress: 0, status: "queued" as const, transferredBytes: 0,
  }));
}

function readRoomCodeFromQr(v: string) {
  const t = v.trim();
  try { const u = new URL(t); const r = u.searchParams.get("room"); if (r) return r.toUpperCase(); } catch { /* raw code */ }
  const m = t.match(/[A-Z0-9]{6}/i); return m ? m[0].toUpperCase() : "";
}

function isPeerSupported() { return Boolean(window.RTCPeerConnection && window.RTCDataChannel && window.WebSocket); }
function isIosSafari() { return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1); }
function chunkSize(direct: boolean, relay: boolean) { if (relay) return RELAY_CHUNK; if (isIosSafari()) return SAFARI_CHUNK; return direct ? DIRECT_CHUNK : SAFARI_CHUNK; }

function fileIcon(name: string, mime: string): string {
  if (mime.startsWith("image/")) return "🖼️";
  if (mime.startsWith("video/")) return "🎬";
  if (mime.startsWith("audio/")) return "🎵";
  if (mime.includes("pdf")) return "📄";
  if (mime.includes("zip") || mime.includes("tar") || name.endsWith(".7z") || name.endsWith(".rar")) return "🗜️";
  if (mime.includes("text") || name.endsWith(".md") || name.endsWith(".txt")) return "📝";
  if (name.endsWith(".apk")) return "📱";
  if (mime.includes("spreadsheet") || name.endsWith(".xlsx") || name.endsWith(".csv")) return "📊";
  return "📁";
}

// ─── App ──────────────────────────────────────────────────────────────────────

function App() {
  // Auth
  const { user, isAnonymous, checkAuth } = useAuthStore();
  const { fetchSubscription } = useSubscriptionStore();

  // Connection state
  const [role, setRole] = useState<Role>(null);
  const [roomCode, setRoomCode] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [deviceName, setDeviceNameState] = useState(() => getDeviceName());
  const [peerName, setPeerName] = useState("Waiting for peer");
  const [connState, setConnState] = useState<ConnectionState>("idle");
  const [statusText, setStatusText] = useState("Create a room or join one to start sharing.");
  const [qrData, setQrData] = useState("");
  const [socketReady, setSocketReady] = useState(false);

  // Files
  const [files, setFiles] = useState<OutgoingFile[]>([]);
  const [incoming, setIncoming] = useState<IncomingFile[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [selectedIncoming, setSelectedIncoming] = useState<Set<string>>(new Set());

  // Transfer stats
  const [transferSpeed, setTransferSpeed] = useState(0);
  const [etaSeconds, setEtaSeconds] = useState<number | null>(null);

  // UI
  const [note, setNote] = useState("");
  const [sharedText, setSharedText] = useState("");
  const [receivedTexts, setReceivedTexts] = useState<string[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>(() => readHistory());
  const [isMuted, setIsMuted] = useState(false);
  const [theme, setTheme] = useState("dark");
  const [installState, setInstallState] = useState<"unavailable" | "ready" | "installed" | "pending">("unavailable");
  const [activeSection, setActiveSection] = useState<AppSection>("connect");
  const [scannerActive, setScannerActive] = useState(false);
  const [scannerError, setScannerError] = useState("");

  // New features
  const [encryptionActive, setEncryptionActive] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [lanPeers, setLanPeers] = useState<LanPeer[]>([]);

  // Refs
  const sessionKeyRef = useRef<string | null>(null);
  const lanRef = useRef<LanDiscovery | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const qrScannerRef = useRef<any>(null);
  const peerJsRef = useRef<Peer | null>(null);
  const peerDataRef = useRef<DataConnection | null>(null);
  const roleRef = useRef<Role>(null);
  const roomCodeRef = useRef("");
  const joinCodeRef = useRef("");
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<RTCDataChannel | null>(null);
  const installPromptRef = useRef<DeferredInstallPrompt | null>(null);
  const fallbackRef = useRef(false);
  const targetSocketRef = useRef<string | null>(null);
  const sendPausedRef = useRef<Record<string, boolean>>({});
  const incomingRef = useRef<Map<string, IncomingFile>>(new Map());
  const activeSendRef = useRef(false);
  const canceledRef = useRef(false);
  const suppressCloseRef = useRef(false);
  const movedBytesRef = useRef(0);
  const totalBytesRef = useRef(0);
  const speedWindowRef = useRef<{ time: number; bytes: number }[]>([]);
  const lastSpeedRef = useRef(0);
  const lastIncomingRef = useRef(0);
  const sendingRef = useRef<Set<string>>(new Set());
  const manifestSentRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [showFilePicker, setShowFilePicker] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const iceServersRef = useRef<RTCIceServer[]>(DEFAULT_ICE);

  // ── Init ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    checkAuth().then(() => {
      const { user: u } = useAuthStore.getState();
      if (u) fetchSubscription();
    });
    // Fetch TURN credentials from server
    fetch(`${import.meta.env.VITE_API_URL || "http://localhost:3001/api"}/turn-credentials`)
      .then(r => r.json())
      .then(d => { if (d.iceServers?.length) iceServersRef.current = d.iceServers; })
      .catch(() => { /* use defaults */ });
    // Request notification permission proactively
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  useEffect(() => { document.documentElement.setAttribute("data-theme", theme); }, [theme]);
  useEffect(() => { roleRef.current = role; }, [role]);
  useEffect(() => { roomCodeRef.current = roomCode; }, [roomCode]);
  useEffect(() => { joinCodeRef.current = joinCode; }, [joinCode]);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chatMessages]);

  // ── Socket setup ──────────────────────────────────────────────────────────

  useEffect(() => {
    const socket: Socket = SIGNAL_URL
      ? io(SIGNAL_URL, { autoConnect: true, transports: ["websocket", "polling"] })
      : ({ connected: false, on: () => {}, once: () => {}, emit: () => {}, connect: () => {}, disconnect: () => {} } as unknown as Socket);
    socketRef.current = socket;

    socket.on("connect", () => setSocketReady(true));
    socket.on("disconnect", () => setSocketReady(false));

    socket.on("room-created", async ({ roomCode: c }: { roomCode: string }) => {
      setRoomCode(c); setConnState("signaling");
      setStatusText("Room ready. Share the code or QR and wait for the receiver.");
      setQrData(await makeQrData(`${window.location.origin}?room=${c}`));
      // Start LAN discovery
      lanRef.current = new LanDiscovery(setLanPeers);
      lanRef.current.start(deviceName, c);
    });

    socket.on("peer-joined", async ({ roomCode: c, peerName: n, socketId: sid }: any) => {
      if (roleRef.current !== "sender") return;
      setPeerName(n); setConnState("connecting");
      setStatusText("Peer detected. Building the direct lane.");
      targetSocketRef.current = sid; playBeep(880, 150);
      await ensurePeerConnection(true, c, sid);
    });

    socket.on("ready", async ({ roomCode: c, peerName: n }: any) => {
      if (roleRef.current !== "receiver") return;
      setRoomCode(c); setPeerName(n); setConnState("connecting");
      setStatusText("Sender detected. Building the direct lane."); playBeep(880, 150);
      await ensurePeerConnection(false, c);
    });

    socket.on("signal", async ({ payload, sender }: any) => {
      const peer = peerRef.current; if (!peer) return;
      if ("type" in payload) {
        await peer.setRemoteDescription(payload);
        if (payload.type === "offer") {
          targetSocketRef.current = sender;
          const ans = await peer.createAnswer();
          await peer.setLocalDescription(ans);
          socket.emit("signal", { roomCode: roomCodeRef.current || joinCodeRef.current.toUpperCase(), target: sender, payload: ans });
        }
      } else if (payload.candidate) {
        await peer.addIceCandidate(payload).catch(() => {});
      }
    });

    socket.on("relay-control", ({ message }: any) => handleControlMessage(message));
    socket.on("relay-data", ({ data }: any) => handleIncomingBinary(data));
    socket.on("peer-left", () => {
      setConnState("idle"); setPeerName("Waiting for peer");
      setStatusText("The other device left. Reuse the room or create a new one.");
      activeSendRef.current = false; canceledRef.current = true;
    });
    socket.on("error", ({ message }: any) => { setConnState("error"); setStatusText(message); });

    // Chat via socket (for relay mode)
    socket.on("chat-message", ({ message }: any) => {
      if (message?.type === "chat") {
        setChatMessages(prev => [...prev, { id: makeId(), sender: message.senderName, text: message.text, createdAt: message.createdAt, own: false }]);
      }
    });

    // PWA install
    const onInstallPrompt = (e: Event) => { e.preventDefault(); installPromptRef.current = e as DeferredInstallPrompt; setInstallState("ready"); };
    const onInstalled = () => { installPromptRef.current = null; setInstallState("installed"); };
    window.addEventListener("beforeinstallprompt", onInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);

    // Auto-join from URL
    const params = new URLSearchParams(window.location.search);
    const prefilled = params.get("room");
    if (prefilled) { const c = prefilled.toUpperCase(); setJoinCode(c); setTimeout(() => joinRoom(c), 250); }

    return () => {
      socket.disconnect(); stopQrScanner();
      channelRef.current?.close(); peerRef.current?.close(); destroyPeerConnection();
      lanRef.current?.stop(deviceName);
      window.removeEventListener("beforeinstallprompt", onInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  // ── Speed tracking ────────────────────────────────────────────────────────

  function updateSpeed(bytes: number) {
    const now = Date.now();
    movedBytesRef.current += bytes;
    speedWindowRef.current.push({ time: now, bytes });
    speedWindowRef.current = speedWindowRef.current.filter(p => now - p.time <= 1500);
    if (now - lastSpeedRef.current < PROGRESS_INTERVAL) return;
    lastSpeedRef.current = now;
    const total = speedWindowRef.current.reduce((s, p) => s + p.bytes, 0);
    const dur = Math.max((now - speedWindowRef.current[0].time) / 1000, 0.3);
    const speed = total / dur;
    setTransferSpeed(speed);
    const pending = Math.max(totalBytesRef.current - movedBytesRef.current, 0);
    setEtaSeconds(speed > 0 ? Math.ceil(pending / speed) : null);
  }

  // ── WebRTC ────────────────────────────────────────────────────────────────

  async function ensurePeerConnection(isInitiator: boolean, code: string, targetId?: string) {
    if (peerRef.current) return;
    const peer = new RTCPeerConnection({ iceServers: iceServersRef.current });
    peerRef.current = peer;

    peer.onicecandidate = e => {
      if (e.candidate) socketRef.current?.emit("signal", { roomCode: code, target: targetId, payload: e.candidate.toJSON() });
    };
    peer.onconnectionstatechange = () => {
      if (peer.connectionState === "connected") { setConnState("connected"); setStatusText("Direct lane ready. Files can move now."); }
      if (peer.connectionState === "failed") { fallbackRef.current = true; setConnState("connected"); setStatusText("Direct connection failed. Switched to relay mode."); }
    };
    peer.ondatachannel = e => setupChannel(e.channel);

    if (isInitiator) {
      const ch = peer.createDataChannel("transfer", { ordered: true });
      setupChannel(ch);
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      socketRef.current?.emit("signal", { roomCode: code, target: targetId, payload: offer });
    }
  }

  function setupChannel(ch: RTCDataChannel) {
    channelRef.current = ch;
    ch.binaryType = "arraybuffer";
    ch.bufferedAmountLowThreshold = BUF_LOW;
    const onOpen = () => { setConnState("connected"); setStatusText("Peer locked in. Files will move directly device to device."); };
    ch.onopen = onOpen;
    if (ch.readyState === "open") onOpen();
    ch.onmessage = e => {
      if (typeof e.data === "string") { handleControlMessage(JSON.parse(e.data)); return; }
      handleIncomingBinary(e.data as ArrayBuffer);
    };
  }

  function setupPeerDataConnection(conn: DataConnection) {
    peerDataRef.current = conn;
    const dc = (conn as any).dataChannel ?? (conn as any)._dc;
    if (dc) { dc.binaryType = "arraybuffer"; dc.bufferedAmountLowThreshold = BUF_LOW; }

    conn.on("open", () => {
      const dc2 = (conn as any).dataChannel ?? (conn as any)._dc;
      if (dc2) { dc2.binaryType = "arraybuffer"; dc2.bufferedAmountLowThreshold = BUF_LOW; }
      fallbackRef.current = false; setConnState("connected"); setSocketReady(true);
      setPeerName(conn.metadata?.peerName ?? (conn.peer.replace(PEER_PREFIX, "").toUpperCase() || "Connected device"));
      setStatusText("Peer locked in. Files will move directly device to device.");
      // Exchange session key (sender initiates)
      if (roleRef.current === "sender") {
        const key = generateSessionKey();
        sessionKeyRef.current = key;
        setEncryptionActive(true);
        conn.send(JSON.stringify({ type: "session-key", key: exportSessionKey(key) }));
      }
    });

    conn.on("data", data => {
      if (typeof data === "string") { handleControlMessage(JSON.parse(data)); return; }
      if (data instanceof ArrayBuffer) { handleIncomingBinary(data); return; }
      if (data instanceof Blob) { data.arrayBuffer().then(handleIncomingBinary); return; }
      if (ArrayBuffer.isView(data)) handleIncomingBinary((data as any).buffer.slice((data as any).byteOffset, (data as any).byteOffset + (data as any).byteLength));
    });

    conn.on("close", () => {
      if (suppressCloseRef.current) { suppressCloseRef.current = false; return; }
      setConnState("idle"); setPeerName("Waiting for peer");
      setStatusText("The other device disconnected. Create or join a room again.");
      activeSendRef.current = false;
    });
    conn.on("error", () => { setConnState("error"); setStatusText("Connection failed. Create a fresh room and join again."); activeSendRef.current = false; });
  }

  function destroyPeerConnection() {
    peerDataRef.current?.close(); peerJsRef.current?.destroy();
    peerDataRef.current = null; peerJsRef.current = null;
    sessionKeyRef.current = null; setEncryptionActive(false);
  }

  // ── Control messages ──────────────────────────────────────────────────────

  function sendControl(msg: ControlMessage) {
    if (peerDataRef.current?.open) { peerDataRef.current.send(JSON.stringify(msg)); return; }
    if (fallbackRef.current || !channelRef.current || channelRef.current.readyState !== "open") {
      socketRef.current?.emit("relay-control", { roomCode, target: targetSocketRef.current, message: msg });
    } else { channelRef.current.send(JSON.stringify(msg)); }
  }

  function sendData(packet: Uint8Array) {
    if (peerDataRef.current?.open) { 
      peerDataRef.current.send(packet); 
      return; 
    }
    if (fallbackRef.current || !channelRef.current || channelRef.current.readyState !== "open") {
      socketRef.current?.emit("relay-data", { roomCode, target: targetSocketRef.current, data: packet });
    } else { 
      // @ts-expect-error - DataChannel has strict ArrayBuffer type checking
      channelRef.current.send(packet); 
    }
  }

  async function handleIncomingBinary(data: ArrayBuffer) {
    const bytes = new Uint8Array(data);
    const idLen = bytes[0];
    const fileId = dec.decode(bytes.subarray(1, idLen + 1));
    let chunk = bytes.subarray(idLen + 1);
    const file = incomingRef.current.get(fileId);
    if (!file) return;

    // Decrypt if session key is set
    if (sessionKeyRef.current) {
      const plain = decryptChunk(chunk, sessionKeyRef.current);
      if (!plain) { console.warn("Decryption failed for chunk of", fileId); return; }
      chunk = new Uint8Array(plain.buffer as ArrayBuffer, plain.byteOffset, plain.byteLength);
    }

    if (file.opfsHandle) { await file.opfsHandle.write(chunk); }
    else { file.chunks.push(chunk); }

    file.transferredBytes += chunk.byteLength;
    file.progress = Math.min((file.transferredBytes / file.size) * 100, 100);
    file.status = "receiving";
    updateSpeed(chunk.byteLength);
    const now = performance.now();
    if (file.transferredBytes >= file.size || now - lastIncomingRef.current >= PROGRESS_INTERVAL) {
      lastIncomingRef.current = now;
      setIncoming(cur => cur.map(e => e.id === fileId ? { ...file } : e));
    }
  }

  async function handleControlMessage(msg: ControlMessage) {
    if (msg.type === "session-key") {
      sessionKeyRef.current = importSessionKey(msg.key);
      setEncryptionActive(true);
      return;
    }

    if (msg.type === "chat") {
      setChatMessages(prev => [...prev, { id: makeId(), sender: msg.senderName, text: msg.text, createdAt: msg.createdAt, own: false }]);
      return;
    }

    if (msg.type === "manifest") {
      const items = msg.files.map<IncomingFile>(f => ({ id: f.id, name: f.name, type: f.type, size: f.size, relativePath: f.relativePath, progress: 0, status: "queued", transferredBytes: 0, chunks: [] }));
      incomingRef.current = new Map(items.map(i => [i.id, i]));
      totalBytesRef.current = items.reduce((s, i) => s + i.size, 0);
      movedBytesRef.current = 0; speedWindowRef.current = []; lastSpeedRef.current = 0; lastIncomingRef.current = 0;
      setPeerName(msg.senderName); setIncoming(items); setSelectedIncoming(new Set(items.map(i => i.id)));
      setNote(msg.note); setStatusText(`Incoming: ${items.length} file(s) from ${msg.senderName}.`);
    }

    if (msg.type === "transfer-note") setNote(msg.text);
    if (msg.type === "text-share") setReceivedTexts(cur => [`${msg.senderName}: ${msg.text}`, ...cur].slice(0, 6));

    if (msg.type === "file-start") {
      setConnState("transferring");
      const file = incomingRef.current.get(msg.fileId);
      if (file && navigator.storage?.getDirectory) {
        try {
          const root = await navigator.storage.getDirectory();
          const handle = await root.getFileHandle(file.id, { create: true });
          if (handle.createWritable) file.opfsHandle = await handle.createWritable();
        } catch { /* fall back to memory */ }
      }
    }

    if (msg.type === "file-complete") {
      const file = incomingRef.current.get(msg.fileId); if (!file) return;
      file.progress = 100; file.status = "done";
      if (file.opfsHandle) {
        try {
          await file.opfsHandle.close();
          const root = await navigator.storage.getDirectory();
          const handle = await root.getFileHandle(file.id);
          file.downloadUrl = URL.createObjectURL(await handle.getFile());
        } catch { /* ignore */ }
      } else {
        const safeChunks = file.chunks.map((c: Uint8Array) => new Uint8Array(c.buffer as ArrayBuffer, c.byteOffset, c.byteLength));
        file.downloadUrl = URL.createObjectURL(new Blob(safeChunks, { type: file.type || "application/octet-stream" }));
      }
      setIncoming(cur => cur.map(e => e.id === file.id ? { ...file } : e));
    }

    if (msg.type === "pause") setFiles(cur => cur.map(f => f.id === msg.fileId && f.status === "sending" ? { ...f, status: "paused" } : f));
    if (msg.type === "resume") { sendPausedRef.current[msg.fileId] = false; void sendQueuedFiles(); }
    if (msg.type === "cancel") { sendPausedRef.current[msg.fileId] = true; setFiles(cur => cur.map(f => f.id === msg.fileId ? { ...f, status: "canceled" } : f)); }

    if (msg.type === "transfer-cancel") {
      canceledRef.current = true; activeSendRef.current = false; setConnState("connected");
      setStatusText(`${msg.senderName} canceled the transfer.`);
      setFiles(cur => cur.map(f => f.status === "done" ? f : { ...f, status: "canceled" }));
      setIncoming(cur => cur.map(f => { const n = f.status === "done" ? f : { ...f, status: "canceled" as const }; incomingRef.current.set(f.id, n); return n; }));
    }

    if (msg.type === "peer-leave") {
      canceledRef.current = true; activeSendRef.current = false; suppressCloseRef.current = true;
      setPeerName("Waiting for peer"); setConnState("idle");
      setStatusText(`${msg.peerName} left the room.`); destroyPeerConnection();
    }

    if (msg.type === "transfer-complete") {
      setConnState("done"); setStatusText("Transfer finished. Everything is ready to save.");
      playBeep(523, 100); setTimeout(() => playBeep(659, 150), 150);
      showToast({ type: "success", title: "Transfer complete", body: "All files received successfully." });
      showBrowserNotification("PeerDash — Transfer complete", "All files received successfully.");
      const items = Array.from(incomingRef.current.values());
      appendHistory({ id: makeId(), roomCode, direction: "received", names: items.map(i => i.name), totalBytes: items.reduce((s, i) => s + i.size, 0), createdAt: new Date().toISOString(), peerLabel: peerName });
      setHistory(readHistory()); activeSendRef.current = false;
    }
  }

  // ── Room management ───────────────────────────────────────────────────────

  async function emitWhenConnected(event: string, payload: Record<string, unknown>) {
    if (!SIGNAL_URL) return;
    const s = socketRef.current; if (!s) return;
    if (s.connected) { s.emit(event, payload); return; }
    s.connect();
    await new Promise<void>(res => s.once("connect", res));
    s.emit(event, payload);
  }

  async function createRoom() {
    if (!isPeerSupported()) { setConnState("error"); setStatusText("WebRTC not supported in this browser."); return; }
    const code = makeRoomCode();
    destroyPeerConnection(); setRole("sender"); setRoomCode(code); setJoinCode(code);
    setConnState("signaling"); setPeerName("Waiting for peer");
    setQrData(await makeQrData(`${window.location.origin}?room=${code}`));
    setSocketReady(false); setStatusText("Creating secure room...");

    const peer = new Peer(`${PEER_PREFIX}${code.toLowerCase()}`, { ...PEER_OPTIONS, config: { iceServers: iceServersRef.current } });
    peerJsRef.current = peer;
    peer.on("open", async () => {
      setSocketReady(true); setStatusText("Room ready. Share the code or QR and wait for the receiver.");
      await emitWhenConnected("create-room", { roomCode: code, peerName: deviceName });
    });
    peer.on("connection", conn => {
      setPeerName((conn.metadata as any)?.peerName ?? "Receiver");
      setStatusText("Receiver found. Opening the peer-to-peer lane...");
      setupPeerDataConnection(conn);
    });
    peer.on("error", err => { setConnState("error"); setSocketReady(false); setStatusText(`Could not create room: ${err?.type ?? err?.message ?? "unknown error"}.`); });
  }

  async function joinRoom(codeOverride?: string) {
    if (!isPeerSupported()) { setConnState("error"); setStatusText("WebRTC not supported in this browser."); return; }
    const code = (codeOverride ?? joinCode).trim().toUpperCase(); if (!code) return;
    destroyPeerConnection(); setRole("receiver"); setRoomCode(code);
    setConnState("signaling"); setSocketReady(false); setStatusText("Joining room...");

    const peer = new Peer(undefined as unknown as string, { ...PEER_OPTIONS, config: { iceServers: iceServersRef.current } });
    peerJsRef.current = peer;
    peer.on("open", async () => {
      setStatusText("Room found. Opening the peer-to-peer lane...");
      const conn = peer.connect(`${PEER_PREFIX}${code.toLowerCase()}`, { reliable: true, metadata: { peerName: deviceName } });
      setupPeerDataConnection(conn);
      await emitWhenConnected("join-room", { roomCode: code, peerName: deviceName });
    });
    peer.on("error", err => { setConnState("error"); setSocketReady(false); setStatusText(`Could not join room: ${err?.type ?? err?.message ?? "unknown error"}.`); });
  }

  // ── QR Scanner ────────────────────────────────────────────────────────────

  async function stopQrScanner() {
    const s = qrScannerRef.current; if (!s) { setScannerActive(false); return; }
    try { if (s.isScanning) await s.stop(); await s.clear(); } catch { /* ignore */ } finally { qrScannerRef.current = null; setScannerActive(false); }
  }

  async function startQrScanner() {
    setScannerError("");
    if (!window.isSecureContext) { setScannerError("Camera scanning needs HTTPS."); return; }
    if (!navigator.mediaDevices?.getUserMedia) { setScannerError("Camera not available in this browser."); return; }
    await stopQrScanner();
    const { Html5Qrcode } = await import("html5-qrcode");
    const scanner = new Html5Qrcode(QR_READER_ID);
    qrScannerRef.current = scanner; setScannerActive(true);
    try {
      await scanner.start({ facingMode: "environment" }, { fps: 10, qrbox: { width: 240, height: 240 } },
        async (text: string) => {
          const code = readRoomCodeFromQr(text);
          if (!code) { setScannerError("QR does not contain a PeerDash room code."); return; }
          setJoinCode(code); await stopQrScanner(); await joinRoom(code);
        }, () => {});
    } catch { setScannerError("Camera permission failed."); await stopQrScanner(); }
  }

  // ── File transfer ─────────────────────────────────────────────────────────

  function getDataChannel() {
    const c = peerDataRef.current as any;
    return (c?.dataChannel ?? c?._dc ?? channelRef.current) as RTCDataChannel | null;
  }

  async function waitForBuffer(ch: RTCDataChannel | null) {
    if (!ch || ch.bufferedAmount <= BUF_HIGH) return;
    await new Promise<void>(res => {
      const onLow = () => { ch.removeEventListener("bufferedamountlow", onLow); res(); };
      const t = setInterval(() => { if (ch.bufferedAmount <= BUF_LOW || ch.readyState !== "open") { clearInterval(t); ch.removeEventListener("bufferedamountlow", onLow); res(); } }, 50);
      ch.addEventListener("bufferedamountlow", onLow);
    });
  }

  async function waitWhilePaused(fileId: string) {
    if (!sendPausedRef.current[fileId] || canceledRef.current) return;
    await new Promise<void>(res => {
      const t = setInterval(() => { if (!sendPausedRef.current[fileId] || canceledRef.current) { clearInterval(t); res(); } }, 120);
    });
  }

  async function sendFile(fileId: string) {
    const file = files.find(f => f.id === fileId);
    if (!file || file.status === "done" || file.status === "canceled") return;
    if (sendingRef.current.has(fileId)) return;
    sendingRef.current.add(fileId);
    setFiles(cur => cur.map(f => f.id === fileId ? { ...f, status: "sending" } : f));
    setStatusText("Transferring… keep both devices awake.");

    try {
      sendControl({ type: "file-start", fileId: file.id });
      let offset = file.transferredBytes;
      let lastProg = 0;
      const cs = chunkSize(Boolean(peerDataRef.current?.open), fallbackRef.current);
      const key = sessionKeyRef.current;

      while (offset < file.file.size && !canceledRef.current) {
        if (sendPausedRef.current[fileId]) await waitWhilePaused(fileId);
        if (canceledRef.current || sendPausedRef.current[fileId] || !sendingRef.current.has(fileId)) break;
        await waitForBuffer(getDataChannel());

        const slice = file.file.slice(offset, offset + cs);
        let bytes = new Uint8Array(await slice.arrayBuffer());
        const originalSize = bytes.byteLength;

        // E2E encrypt chunk
        if (key) {
          const encrypted = encryptChunk(bytes, key);
          bytes = new Uint8Array(encrypted);
        }

        const idBytes = enc.encode(file.id);
        const packet = new Uint8Array(1 + idBytes.length + bytes.length);
        packet[0] = idBytes.length; packet.set(idBytes, 1); packet.set(bytes, 1 + idBytes.length);
        sendData(packet);

        offset += originalSize;
        updateSpeed(originalSize);
        const now = performance.now();
        if (offset >= file.file.size || now - lastProg >= PROGRESS_INTERVAL) {
          lastProg = now;
          setFiles(cur => cur.map(f => f.id === fileId ? { ...f, transferredBytes: offset, progress: Math.min((offset / f.file.size) * 100, 100), status: offset >= f.file.size ? "done" : "sending" } : f));
        }
      }

      if (!canceledRef.current && !sendPausedRef.current[fileId]) {
        sendControl({ type: "file-complete", fileId: file.id });
        setFiles(cur => cur.map(f => f.id === fileId ? { ...f, status: "done", progress: 100 } : f));
      }
    } finally { sendingRef.current.delete(fileId); }
  }

  async function sendQueuedFiles() {
    const peerReady = Boolean(peerDataRef.current?.open);
    if (!peerReady && !fallbackRef.current && (!channelRef.current || channelRef.current.readyState !== "open")) return;
    const active = files.filter(f => f.status !== "canceled" && f.status !== "done");
    if (active.length === 0) return;

    if (!activeSendRef.current) {
      activeSendRef.current = true; canceledRef.current = false;
      totalBytesRef.current = active.reduce((s, f) => s + (f.file.size - f.transferredBytes), 0);
      movedBytesRef.current = 0; speedWindowRef.current = []; lastSpeedRef.current = 0;
      setConnState("transferring");
    }

    // Send session key if not yet sent (sender side, direct connection)
    if (roleRef.current === "sender" && !sessionKeyRef.current && peerDataRef.current?.open) {
      const key = generateSessionKey();
      sessionKeyRef.current = key; setEncryptionActive(true);
      sendControl({ type: "session-key", key: exportSessionKey(key) });
    }

    sendControl({ type: "manifest", files: files.filter(f => f.status !== "canceled").map(f => ({ id: f.id, name: f.file.name, size: f.file.size, type: f.file.type, relativePath: f.relativePath })), note, senderName: deviceName });
    if (note.trim() && !manifestSentRef.current) { sendControl({ type: "transfer-note", text: note.trim(), senderName: deviceName }); manifestSentRef.current = true; }

    active.forEach(f => sendFile(f.id).catch(() => {}));

    const allDone = files.every(f => f.status === "done" || f.status === "canceled");
    if (allDone && active.length > 0) {
      sendControl({ type: "transfer-complete" });
      setConnState("done"); setStatusText("Transfer complete! Files are ready to save on the other device.");
      playBeep(523, 100, isMuted); setTimeout(() => playBeep(659, 150, isMuted), 150);
      showToast({ type: "success", title: "Transfer complete", body: `Sent ${active.length} file(s) to ${peerName}.` });
      showBrowserNotification("PeerDash — Transfer complete", `Sent ${active.length} file(s) to ${peerName}.`);
      appendHistory({ id: makeId(), roomCode, direction: "sent", names: files.filter(f => f.status !== "canceled").map(f => f.file.name), totalBytes: files.filter(f => f.status !== "canceled").reduce((s, f) => s + f.file.size, 0), createdAt: new Date().toISOString(), peerLabel: peerName });
      setHistory(readHistory()); activeSendRef.current = false; manifestSentRef.current = false;
    }
  }

  // Auto-send when files added and connected
  useEffect(() => {
    if ((connState === "connected" || connState === "transferring") && role === "sender" && files.length > 0) {
      if (files.some(f => f.status !== "done" && f.status !== "canceled")) void sendQueuedFiles();
    }
  }, [files, connState, role]);

  // ── UI actions ────────────────────────────────────────────────────────────

  function onPickFiles(e: ChangeEvent<HTMLInputElement>) {
    const nf = getSelectedFiles(e); if (nf.length > 0) { setFiles(cur => [...cur, ...nf]); e.target.value = ""; }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault(); setDragActive(false);
    if (e.dataTransfer.files?.length) {
      setFiles(cur => [...cur, ...Array.from(e.dataTransfer.files).map(f => ({ id: makeId(), file: f, relativePath: f.webkitRelativePath || f.name, progress: 0, status: "queued" as const, transferredBytes: 0 }))]);
    }
  }

  function pauseFile(id: string) { sendPausedRef.current[id] = true; sendControl({ type: "pause", fileId: id }); setFiles(cur => cur.map(f => f.id === id ? { ...f, status: "paused" } : f)); }
  function resumeFile(id: string) { sendPausedRef.current[id] = false; sendControl({ type: "resume", fileId: id }); setFiles(cur => cur.map(f => f.id === id ? { ...f, status: "queued" } : f)); void sendQueuedFiles(); }
  function cancelFile(id: string) { sendPausedRef.current[id] = true; sendControl({ type: "cancel", fileId: id }); setFiles(cur => cur.map(f => f.id === id ? { ...f, status: "canceled" } : f)); }

  function cancelTransfer() {
    canceledRef.current = true; activeSendRef.current = false;
    files.forEach(f => { if (f.status !== "done") sendPausedRef.current[f.id] = true; });
    sendControl({ type: "transfer-cancel", senderName: deviceName });
    setFiles(cur => cur.map(f => f.status === "done" ? f : { ...f, status: "canceled" }));
    setIncoming(cur => cur.map(f => { const n = f.status === "done" ? f : { ...f, status: "canceled" as const }; incomingRef.current.set(f.id, n); return n; }));
    setConnState(peerDataRef.current?.open || channelRef.current?.readyState === "open" ? "connected" : "idle");
    setStatusText("Transfer canceled. The room is still open.");
  }

  function leaveRoom() {
    canceledRef.current = true; activeSendRef.current = false; suppressCloseRef.current = true;
    sendControl({ type: "peer-leave", peerName: deviceName });
    destroyPeerConnection(); channelRef.current?.close(); peerRef.current?.close();
    peerRef.current = null; channelRef.current = null; fallbackRef.current = false; targetSocketRef.current = null;
    lanRef.current?.stop(deviceName); lanRef.current = null; setLanPeers([]);
    setRole(null); setRoomCode(""); setJoinCode(""); setQrData(""); setPeerName("Waiting for peer");
    setConnState("idle"); setSocketReady(false); setChatMessages([]);
    setStatusText("You left the room. Create or join one to start sharing again.");
  }

  async function sendText() {
    if (!sharedText.trim()) return;
    sendControl({ type: "text-share", text: sharedText.trim(), senderName: deviceName, createdAt: new Date().toISOString() });
    setReceivedTexts(cur => [`You: ${sharedText.trim()}`, ...cur].slice(0, 6)); setSharedText("");
  }

  function sendChatMessage() {
    if (!chatInput.trim()) return;
    const msg: ControlMessage = { type: "chat", text: chatInput.trim(), senderName: deviceName, createdAt: new Date().toISOString() };
    sendControl(msg);
    setChatMessages(prev => [...prev, { id: makeId(), sender: deviceName, text: chatInput.trim(), createdAt: new Date().toISOString(), own: true }]);
    setChatInput("");
  }

  function downloadSelected() {
    const targets = incoming.filter(f => selectedIncoming.has(f.id) && f.status === "done" && f.downloadUrl);
    if (Capacitor.isNativePlatform()) targets.forEach(saveNativeFile);
    else targets.forEach(f => triggerDownload(f.downloadUrl!, f.name));
  }

  function triggerDownload(url: string, name: string) {
    const a = document.createElement("a"); a.href = url; a.download = name; a.rel = "noopener";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    if (isIosSafari()) setTimeout(() => window.open(url, "_blank", "noopener"), 250);
  }

  async function downloadAsZip() {
    const targets = incoming.filter(f => selectedIncoming.has(f.id) && f.status === "done"); if (!targets.length) return;
    const zip = new JSZip();
    targets.forEach(f => { if (f.chunks?.length) {
      const safeChunks = f.chunks.map((c: Uint8Array) => new Uint8Array(c.buffer as ArrayBuffer, c.byteOffset, c.byteLength));
      zip.file(f.relativePath || f.name, new Blob(safeChunks, { type: f.type || "application/octet-stream" }));
    } });
    setStatusText("Generating ZIP…");
    const content = await zip.generateAsync({ type: "blob" });
    if (Capacitor.isNativePlatform()) {
      const reader = new FileReader(); reader.readAsDataURL(content);
      reader.onloadend = async () => {
        const b64 = (reader.result as string).split(",")[1];
        try { await Filesystem.writeFile({ path: `Download/PeerDash_${Date.now()}.zip`, data: b64, directory: Directory.ExternalStorage, recursive: true }); alert("Saved ZIP to Downloads."); } catch { alert("Failed to save ZIP."); }
      };
    } else { triggerDownload(URL.createObjectURL(content), `PeerDash_${Date.now()}.zip`); }
    setStatusText("Transfer finished. Everything is ready to save.");
  }

  async function saveNativeFile(file: IncomingFile) {
    if (!file.chunks?.length) return;
    const safeChunks = file.chunks.map(c => new Uint8Array(c.buffer as ArrayBuffer, c.byteOffset, c.byteLength));
    const reader = new FileReader(); reader.readAsDataURL(new Blob(safeChunks, { type: file.type || "application/octet-stream" }));
    reader.onloadend = async () => {
      const b64 = (reader.result as string).split(",")[1];
      try { await Filesystem.writeFile({ path: `Download/PeerDash_${file.name}`, data: b64, directory: Directory.ExternalStorage, recursive: true }); alert(`Saved ${file.name}.`); } catch { alert(`Failed to save ${file.name}.`); }
    };
  }

  async function copyRoomCode() {
    if (!roomCode) return;
    try {
      if (navigator.clipboard?.writeText && window.isSecureContext) await navigator.clipboard.writeText(roomCode);
      else { const i = document.createElement("input"); i.value = roomCode; i.style.cssText = "position:fixed;opacity:0"; document.body.appendChild(i); i.select(); document.execCommand("copy"); document.body.removeChild(i); }
      showToast({ type: "info", title: "Copied", body: `Room code ${roomCode} copied to clipboard.` });
    } catch { setStatusText(`Room code: ${roomCode}`); }
  }

  async function installApp() {
    if (installPromptRef.current) {
      setInstallState("pending"); await installPromptRef.current.prompt();
      const r = await installPromptRef.current.userChoice;
      setInstallState(r.outcome === "accepted" ? "installed" : "ready");
    } else if (window.matchMedia("(display-mode: standalone)").matches) { setInstallState("installed"); }
    else { setInstallState("unavailable"); }
  }

  function handleDeviceNameChange(name: string) { setDeviceNameState(name); setDeviceName(name); }

  // ── Derived ───────────────────────────────────────────────────────────────

  const totalOutgoing = useMemo(() => files.reduce((s, f) => s + f.file.size, 0), [files]);
  const sentBytes = useMemo(() => files.reduce((s, f) => s + f.transferredBytes, 0), [files]);
  const totalIncoming = useMemo(() => incoming.reduce((s, f) => s + f.size, 0), [incoming]);
  const receivedBytes = useMemo(() => incoming.reduce((s, f) => s + f.transferredBytes, 0), [incoming]);
  const hasRoom = Boolean(roomCode || peerDataRef.current?.open || channelRef.current?.readyState === "open");
  const canCancel = connState === "transferring" || files.some(f => ["queued","sending","paused"].includes(f.status)) || incoming.some(f => ["queued","receiving"].includes(f.status));
  const isConnected = connState === "connected" || connState === "transferring" || connState === "done";

  // ── Render ────────────────────────────────────────────────────────────────

  // Show login screen if not authenticated and not anonymous
  if (!user && !isAnonymous) return <LoginScreen />;

  const sections: Array<{ id: AppSection; label: string; meta: string }> = [
    { id: "connect", label: "Connect", meta: roomCode || "No room" },
    { id: "send", label: "Send", meta: `${files.length} files` },
    { id: "receive", label: "Receive", meta: `${incoming.length} items` },
    { id: "tools", label: "Tools", meta: receivedTexts.length ? `${receivedTexts.length} notes` : "Notes" },
    { id: "chat", label: "Chat", meta: chatMessages.length ? `${chatMessages.length} msgs` : "Room chat" },
    { id: "history", label: "History", meta: `${history.length} recent` },
  ];

  return (
    <div className="shell">
      {/* ── Hero ── */}
      <section className="hero">
        <div>
          <div className="hero-top-row">
            <span className="eyebrow">PeerDash</span>
            <UserHeader />
          </div>
          <h1>Faster direct file transfer with an InShare-style room flow.</h1>
          <p>Send files, folders, text snippets, and quick notes between devices with QR join, chunked WebRTC streaming, queue controls, and local transfer history.</p>
          <div className="actions" style={{ marginTop: "1rem" }}>
            <button onClick={() => setTheme(t => t === "dark" ? "light" : "dark")}>{theme === "dark" ? "☀️ Light" : "🌙 Dark"}</button>
            <button onClick={() => setIsMuted(m => !m)}>{isMuted ? "🔇 Unmute" : "🔊 Mute"}</button>
            <button onClick={installApp}>{installState === "installed" ? "✅ Installed" : installState === "ready" ? "📲 Install app" : "Install"}</button>
          </div>
        </div>
        <div className="hero-card">
          <div className="hero-card-top">
            <div className="status-pill">{connState.toUpperCase()}</div>
            <EncryptionBadge active={encryptionActive} />
          </div>
          <h2>{roomCode ? `Room ${roomCode}` : "No active room yet"}</h2>
          <p>{statusText}</p>
          <p className="muted">Signal: {socketReady ? "🟢 online" : "🔴 reconnecting"}</p>
          <div className="metrics">
            <div><strong>{formatBytes(transferSpeed)}/s</strong><span>Speed</span></div>
            <div><strong>{etaSeconds ? `${etaSeconds}s` : "--"}</strong><span>ETA</span></div>
            <div><strong>{role === "sender" ? formatBytes(sentBytes) : formatBytes(receivedBytes)}</strong><span>Moved</span></div>
          </div>
        </div>
      </section>

      {/* ── Tabs ── */}
      <nav className="section-tabs" aria-label="PeerDash sections" style={{ gridTemplateColumns: `repeat(${sections.length}, minmax(0, 1fr))` }}>
        {sections.map(s => (
          <button key={s.id} className={`section-tab${activeSection === s.id ? " active" : ""}`} onClick={() => setActiveSection(s.id)}>
            <span>{s.label}</span><small>{s.meta}</small>
          </button>
        ))}
      </nav>

      {/* ── Panels ── */}
      <main className="section-stage">

        {/* Connect */}
        {activeSection === "connect" && (
          <section className="app-section"><div className="panel">
            <h3>Connect devices</h3>
            <label className="field"><span>Device name</span>
              <input value={deviceName} onChange={e => handleDeviceNameChange(e.target.value)} />
            </label>
            <div className="actions">
              <button className="primary" onClick={createRoom}>Create sender room</button>
              <button onClick={() => joinRoom()}>Join as receiver</button>
              <button onClick={scannerActive ? stopQrScanner : startQrScanner}>{scannerActive ? "Stop camera" : "Scan QR"}</button>
              <button className="danger" onClick={cancelTransfer} disabled={!canCancel}>Cancel transfer</button>
              <button onClick={leaveRoom} disabled={!hasRoom}>Leave room</button>
            </div>
            <label className="field"><span>Join code</span>
              <input value={joinCode} onChange={e => setJoinCode(e.target.value.toUpperCase())} placeholder="ABC123" />
            </label>
            <div className={`scanner-wrap${scannerActive ? " active" : ""}`}><div id={QR_READER_ID} className="scanner-view" /></div>
            {scannerError && <p className="muted scanner-error">{scannerError}</p>}
            {qrData && <img className="qr" src={qrData} alt="Room QR code" />}
            <p className="muted">Peer: {peerName}</p>
            {/* LAN peers */}
            {lanPeers.length > 0 && (
              <div className="lan-peers">
                <p className="muted" style={{ marginBottom: "0.5rem" }}>📡 Nearby on same browser:</p>
                {lanPeers.map(p => (
                  <button key={p.deviceName} className="lan-peer-btn" onClick={() => { setJoinCode(p.roomCode); joinRoom(p.roomCode); }}>
                    {p.deviceName} — {p.roomCode}
                  </button>
                ))}
              </div>
            )}
          </div></section>
        )}

        {/* Send */}
        {activeSection === "send" && (
          <section className="app-section">
            <div
              className={`panel${dragActive ? " drag-active" : ""}`}
              onDragOver={e => { e.preventDefault(); setDragActive(true); }}
              onDragLeave={e => { e.preventDefault(); setDragActive(false); }}
              onDrop={handleDrop}
            >
              <div className="panel-head">
                <div><h3>Send queue</h3><p>{files.length} items · {formatBytes(totalOutgoing)}</p></div>
                <div className="actions">
                  <button
                    className="primary"
                    onClick={sendQueuedFiles}
                    disabled={files.length === 0 || connState === "idle" || connState === "signaling"}
                  >
                    ▶ Start transfer
                  </button>
                  {files.length > 0 && (
                    <button onClick={() => setFiles([])} style={{ color: "#ff6b6b" }}>Clear all</button>
                  )}
                </div>
              </div>

              {/* ── Direct label→input: zero JS, works on every Android browser ── */}
              {files.length === 0 ? (
                <label className="pick-zone" htmlFor="pd-file-input" aria-label="Add files to send">
                  <span className="pick-zone-icon">＋</span>
                  <span className="pick-zone-label">Tap to choose files</span>
                  <span className="pick-zone-sub">Opens your file manager directly</span>
                  <span className="pick-zone-sub" style={{ marginTop: "0.25rem", opacity: 0.45 }}>
                    Any file · Photos · Videos · Documents
                  </span>
                  <input
                    id="pd-file-input"
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept="*/*"
                    onChange={onPickFiles}
                    className="pick-zone-input"
                  />
                </label>
              ) : (
                <label className="pick-zone pick-zone-compact" htmlFor="pd-file-input-more">
                  <span style={{ fontSize: "1.4rem" }}>＋</span>
                  <span>Add more files</span>
                  <input
                    id="pd-file-input-more"
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept="*/*"
                    onChange={onPickFiles}
                    className="pick-zone-input"
                  />
                </label>
              )}

              <div className="list">
                {files.map((f, i) => {
                  const thumb = f.file.type.startsWith("image/") ? URL.createObjectURL(f.file) : null;
                  return (
                    <article key={f.id} className="row" style={{ animationDelay: `${i * 0.05}s` }}>
                      <div className="row-info">
                        {thumb
                          ? <img src={thumb} className="thumb" alt="preview" />
                          : <span className="file-icon">{fileIcon(f.file.name, f.file.type)}</span>}
                        <div>
                          <strong>{f.relativePath}</strong>
                          <p>{formatBytes(f.file.size)} · <span className="status-badge" data-status={f.status}>{f.status}</span></p>
                        </div>
                      </div>
                      <div className="row-actions">
                        <progress max={100} value={f.progress} />
                        {f.status === "sending" && <button onClick={() => pauseFile(f.id)}>Pause</button>}
                        {f.status === "paused" && <button onClick={() => resumeFile(f.id)}>Resume</button>}
                        {f.status !== "done" && f.status !== "canceled" && (
                          <button onClick={() => cancelFile(f.id)} aria-label="Remove file">✕</button>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        {/* Receive */}
        {activeSection === "receive" && (
          <section className="app-section"><div className="panel">
            <div className="panel-head">
              <div><h3>Receiver inbox</h3><p>{incoming.length} items · {formatBytes(totalIncoming)}</p></div>
              <div className="actions">
                <button onClick={() => setSelectedIncoming(selectedIncoming.size === incoming.length && incoming.length > 0 ? new Set() : new Set(incoming.map(f => f.id)))} disabled={incoming.length === 0}>{selectedIncoming.size === incoming.length && incoming.length > 0 ? "Deselect All" : "Select All"}</button>
                <button className="primary" onClick={downloadSelected} disabled={selectedIncoming.size === 0 || !incoming.some(f => selectedIncoming.has(f.id) && f.status === "done")}>Download Selected</button>
                <button onClick={downloadAsZip} disabled={selectedIncoming.size === 0 || !incoming.some(f => selectedIncoming.has(f.id) && f.status === "done")}>Download as ZIP</button>
              </div>
            </div>
            <div className="list">
              {incoming.length === 0 && <p className="muted">Incoming files appear here after the sender shares the manifest.</p>}
              {incoming.map(f => (
                <article key={f.id} className="row">
                  <div className="row-info">
                    <input type="checkbox" checked={selectedIncoming.has(f.id)} onChange={() => setSelectedIncoming(prev => { const n = new Set(prev); n.has(f.id) ? n.delete(f.id) : n.add(f.id); return n; })} />
                    {f.type.startsWith("image/") && f.downloadUrl && <img src={f.downloadUrl} className="thumb" alt="preview" />}
                    <div><strong>{f.relativePath}</strong><p>{formatBytes(f.size)} · {f.status}</p></div>
                  </div>
                  <div className="row-actions">
                    <progress max={100} value={f.progress} />
                    {f.downloadUrl && !Capacitor.isNativePlatform() && <a className="download" href={f.downloadUrl} download={f.name}>Save</a>}
                    {f.downloadUrl && Capacitor.isNativePlatform() && <button className="download" onClick={() => saveNativeFile(f)}>Save</button>}
                  </div>
                </article>
              ))}
            </div>
          </div></section>
        )}

        {/* Tools */}
        {activeSection === "tools" && (
          <section className="app-section"><div className="panel">
            <h3>Quick share tools</h3>
            <label className="field"><span>Transfer note</span><textarea value={note} onChange={e => setNote(e.target.value)} rows={3} placeholder="Example: drop these in your downloads folder" /></label>
            <label className="field"><span>Clipboard / text share</span><textarea value={sharedText} onChange={e => setSharedText(e.target.value)} rows={3} placeholder="Paste a link, password, or short note" /></label>
            <div className="actions">
              <button onClick={sendText} disabled={!isConnected}>Send text</button>
              <button onClick={copyRoomCode} disabled={!roomCode}>Copy room code</button>
            </div>
            <div className="chip-list">
              {receivedTexts.length === 0 && <span className="muted">No quick text shared yet.</span>}
              {receivedTexts.map(t => <span className="chip" key={t}>{t}</span>)}
            </div>
          </div></section>
        )}

        {/* Chat */}
        {activeSection === "chat" && (
          <section className="app-section"><div className="panel chat-panel">
            <h3>Room chat</h3>
            <div className="chat-messages">
              {chatMessages.length === 0 && <p className="muted">No messages yet. Say hello!</p>}
              {chatMessages.map(m => (
                <div key={m.id} className={`chat-msg${m.own ? " own" : ""}`}>
                  {!m.own && <span className="chat-sender">{m.sender}</span>}
                  <span className="chat-bubble">{m.text}</span>
                  <span className="chat-time">{new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
            <div className="chat-input-row">
              <input value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), sendChatMessage())} placeholder="Type a message…" disabled={!isConnected} />
              <button className="primary" onClick={sendChatMessage} disabled={!isConnected || !chatInput.trim()}>Send</button>
            </div>
          </div></section>
        )}

        {/* History */}
        {activeSection === "history" && (
          <section className="app-section"><div className="panel">
            <div className="panel-head">
              <div><h3>Recent transfer history</h3><p>Local to this device.</p></div>
              <div className="actions"><button onClick={() => { clearHistory(); setHistory([]); }} disabled={history.length === 0}>Clear history</button></div>
            </div>
            <div className="list">
              {history.length === 0 && <p className="muted">No transfer history yet.</p>}
              {history.map(h => (
                <article key={h.id} className="row">
                  <div><strong>{h.direction === "sent" ? "Sent" : "Received"} · {h.peerLabel}</strong><p>{h.names.join(", ")} · {formatBytes(h.totalBytes)}</p></div>
                  <div><span className="chip">{h.roomCode}</span><span className="muted">{new Date(h.createdAt).toLocaleString()}</span></div>
                </article>
              ))}
            </div>
          </div></section>
        )}

      </main>
    </div>
  );
}

export default App;
