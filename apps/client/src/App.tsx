// @ts-nocheck
import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import { io, Socket } from "socket.io-client";
import Peer, { DataConnection } from "peerjs";
import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory } from "@capacitor/filesystem";
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
  opfsHandle?: any;
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

type DeferredInstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

type AppSection = "connect" | "send" | "receive" | "tools" | "history";

const SIGNAL_URL = import.meta.env.VITE_SIGNAL_SERVER_URL ?? (import.meta.env.DEV ? "http://localhost:3001" : "");
const PEER_PREFIX = "peerdash-room-";
const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:openrelay.metered.ca:80" },
  {
    urls: "turn:openrelay.metered.ca:80",
    username: "openrelayproject",
    credential: "openrelayproject"
  },
  {
    urls: "turn:openrelay.metered.ca:443",
    username: "openrelayproject",
    credential: "openrelayproject"
  },
  {
    urls: "turn:openrelay.metered.ca:443?transport=tcp",
    username: "openrelayproject",
    credential: "openrelayproject"
  }
];
const PEER_OPTIONS = {
  host: "0.peerjs.com",
  port: 443,
  path: "/",
  secure: true,
  config: { iceServers: ICE_SERVERS }
};
const QR_READER_ID = "peerdash-qr-reader";
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

function playBeep(frequency = 440, duration = 100, muted = false) {
  if (muted) return;
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

function readRoomCodeFromQr(value: string) {
  const trimmed = value.trim();
  try {
    const parsed = new URL(trimmed);
    const room = parsed.searchParams.get("room");
    if (room) return room.toUpperCase();
  } catch {
    // Raw six-character room codes are also valid QR payloads.
  }

  const match = trimmed.match(/[A-Z0-9]{6}/i);
  return match ? match[0].toUpperCase() : "";
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
  const [isMuted, setIsMuted] = useState(false);
  const [theme, setTheme] = useState("dark");
  const [socketReady, setSocketReady] = useState(false);
  const [installState, setInstallState] = useState<"unavailable" | "ready" | "installed" | "pending">("unavailable");
  const [activeSection, setActiveSection] = useState<AppSection>("connect");
  const [scannerActive, setScannerActive] = useState(false);
  const [scannerError, setScannerError] = useState("");

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const socketRef = useRef<Socket | null>(null);
  const qrScannerRef = useRef<any | null>(null);
  const peerJsRef = useRef<Peer | null>(null);
  const peerDataRef = useRef<DataConnection | null>(null);
  const roleRef = useRef<Role>(null);
  const roomCodeRef = useRef("");
  const joinCodeRef = useRef("");
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<RTCDataChannel | null>(null);
  const installPromptRef = useRef<DeferredInstallPrompt | null>(null);
  const fallbackModeRef = useRef(false);
  const targetSocketIdRef = useRef<string | null>(null);
  const sendPausedRef = useRef<Record<string, boolean>>({});
  const incomingRef = useRef<Map<string, IncomingFile>>(new Map());
  const activeSendRef = useRef(false);
  const movedBytesRef = useRef(0);
  const totalBytesRef = useRef(0);
  const speedWindowRef = useRef<{ time: number; bytes: number }[]>([]);

  function sendControl(msg: ControlMessage) {
    if (peerDataRef.current?.open) {
      peerDataRef.current.send(JSON.stringify(msg));
      return;
    }
    if (fallbackModeRef.current || !channelRef.current || channelRef.current.readyState !== "open") {
      socketRef.current?.emit("relay-control", { roomCode, target: targetSocketIdRef.current, message: msg });
    } else {
      channelRef.current.send(JSON.stringify(msg));
    }
  }

  function sendData(packet: Uint8Array) {
    if (peerDataRef.current?.open) {
      peerDataRef.current.send(packet.buffer.slice(packet.byteOffset, packet.byteOffset + packet.byteLength));
      return;
    }
    if (fallbackModeRef.current || !channelRef.current || channelRef.current.readyState !== "open") {
      socketRef.current?.emit("relay-data", { roomCode, target: targetSocketIdRef.current, data: packet });
    } else {
      channelRef.current.send(packet);
    }
  }

  async function handleIncomingBinary(data: ArrayBuffer) {
    const bytes = new Uint8Array(data);
    const idLength = bytes[0];
    const fileId = decoder.decode(bytes.slice(1, idLength + 1));
    const chunk = bytes.slice(idLength + 1);
    const file = incomingRef.current.get(fileId);
    if (!file) return;

    if (file.opfsHandle) {
      await file.opfsHandle.write(chunk);
    } else {
      file.chunks.push(chunk);
    }

    file.transferredBytes += chunk.byteLength;
    file.progress = Math.min((file.transferredBytes / file.size) * 100, 100);
    file.status = "receiving";
    updateSpeed(chunk.byteLength);
    setIncoming((current) => current.map((entry) => (entry.id === fileId ? { ...file } : entry)));
  }

  const totalOutgoing = useMemo(() => files.reduce((sum, item) => sum + item.file.size, 0), [files]);
  const sentBytes = useMemo(() => files.reduce((sum, item) => sum + item.transferredBytes, 0), [files]);
  const totalIncoming = useMemo(() => incoming.reduce((sum, item) => sum + item.size, 0), [incoming]);
  const receivedBytes = useMemo(() => incoming.reduce((sum, item) => sum + item.transferredBytes, 0), [incoming]);

  useEffect(() => {
    roleRef.current = role;
  }, [role]);

  useEffect(() => {
    roomCodeRef.current = roomCode;
  }, [roomCode]);

  useEffect(() => {
    joinCodeRef.current = joinCode;
  }, [joinCode]);

  useEffect(() => {
    const socket = SIGNAL_URL ? io(SIGNAL_URL, {
      autoConnect: true,
      transports: ["websocket", "polling"]
    }) : ({
      connected: false,
      on: () => undefined,
      once: () => undefined,
      emit: () => undefined,
      connect: () => undefined,
      disconnect: () => undefined
    } as unknown as Socket);
    socketRef.current = socket;

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      installPromptRef.current = event as DeferredInstallPrompt;
      setInstallState("ready");
    };

    const handleInstalled = () => {
      installPromptRef.current = null;
      setInstallState("installed");
    };

    socket.on("connect", () => {
      setSocketReady(true);
    });

    socket.on("disconnect", () => {
      setSocketReady(false);
    });

    socket.on("room-created", async ({ roomCode: nextCode }: { roomCode: string }) => {
      setRoomCode(nextCode);
      setStatusText("Room ready. Share the code or QR and wait for the receiver.");
      setState("signaling");
      setQrData(await makeQrData(`${window.location.origin}?room=${nextCode}`));
    });

    socket.on("peer-joined", async ({ roomCode: activeCode, peerName: nextPeer, socketId }: { roomCode: string; peerName: string; socketId: string }) => {
      if (roleRef.current === "sender") {
        setPeerName(nextPeer);
        setState("connecting");
        setStatusText("Peer detected. Building the direct lane.");
        targetSocketIdRef.current = socketId;
        playBeep(880, 150);
        await ensurePeerConnection(true, activeCode, socketId);
      }
    });

    socket.on("ready", async ({ roomCode: activeCode, peerName: nextPeer }: { roomCode: string; peerName: string }) => {
      if (roleRef.current === "receiver") {
        setRoomCode(activeCode);
        setPeerName(nextPeer);
        setState("connecting");
        setStatusText("Sender detected. Building the direct lane.");
        playBeep(880, 150);
        await ensurePeerConnection(false, activeCode);
      }
    });

    socket.on("signal", async ({ payload, sender }: { payload: RTCSessionDescriptionInit | RTCIceCandidateInit, sender: string }) => {
      const peer = peerRef.current;
      if (!peer) return;
      if ("type" in payload) {
        await peer.setRemoteDescription(payload);
        if (payload.type === "offer") {
          targetSocketIdRef.current = sender;
          const answer = await peer.createAnswer();
          await peer.setLocalDescription(answer);
          socket.emit("signal", { roomCode: roomCodeRef.current || joinCodeRef.current.toUpperCase(), target: sender, payload: answer });
        }
      } else if (payload.candidate) {
        await peer.addIceCandidate(payload).catch(() => undefined);
      }
    });

    socket.on("relay-control", async ({ message }: { message: ControlMessage }) => {
      await handleControlMessage(message);
    });

    socket.on("relay-data", ({ data }: { data: ArrayBuffer }) => {
      handleIncomingBinary(data);
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
      const activeCode = prefilled.toUpperCase();
      setJoinCode(activeCode);
      setActiveSection("connect");
      window.setTimeout(() => {
        void joinRoom(activeCode);
      }, 250);
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);

    return () => {
      socket.disconnect();
      stopQrScanner();
      channelRef.current?.close();
      peerRef.current?.close();
      destroyPeerConnection();
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

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

  async function ensurePeerConnection(isInitiator: boolean, activeCode: string, targetId?: string) {
    if (peerRef.current) return;
    const peer = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    peerRef.current = peer;

    peer.onicecandidate = (event) => {
      if (event.candidate) {
        socketRef.current?.emit("signal", { roomCode: activeCode, target: targetId, payload: event.candidate.toJSON() });
      }
    };

    peer.onconnectionstatechange = () => {
      if (peer.connectionState === "connected") {
        setState("connected");
        setStatusText("Direct lane ready. Files can move now.");
      }
      if (peer.connectionState === "failed") {
        fallbackModeRef.current = true;
        setState("connected");
        setStatusText("Direct connection failed. Switched to Relay mode (slower).");
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
      socketRef.current?.emit("signal", { roomCode: activeCode, target: targetId, payload: offer });
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
      handleIncomingBinary(event.data as ArrayBuffer);
    };
  }

  function setupPeerDataConnection(connection: DataConnection) {
    peerDataRef.current = connection;

    connection.on("open", () => {
      fallbackModeRef.current = false;
      setState("connected");
      setSocketReady(true);
      setPeerName(connection.peer.replace(PEER_PREFIX, "") || "Connected device");
      setStatusText("Peer locked in. Files will move directly device to device.");
    });

    connection.on("data", (data) => {
      if (typeof data === "string") {
        handleControlMessage(JSON.parse(data) as ControlMessage);
        return;
      }

      if (data instanceof ArrayBuffer) {
        handleIncomingBinary(data);
        return;
      }

      if (data instanceof Blob) {
        data.arrayBuffer().then(handleIncomingBinary);
        return;
      }

      if (ArrayBuffer.isView(data)) {
        handleIncomingBinary(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
      }
    });

    connection.on("close", () => {
      setState("idle");
      setPeerName("Waiting for peer");
      setStatusText("The other device disconnected. Create or join a room again.");
      activeSendRef.current = false;
    });

    connection.on("error", () => {
      setState("error");
      setStatusText("Connection failed. Create a fresh room and join again.");
      activeSendRef.current = false;
    });
  }

  function destroyPeerConnection() {
    peerDataRef.current?.close();
    peerJsRef.current?.destroy();
    peerDataRef.current = null;
    peerJsRef.current = null;
  }

  async function handleControlMessage(message: ControlMessage) {
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
      const file = incomingRef.current.get(message.fileId);
      if (file && navigator.storage && navigator.storage.getDirectory) {
        try {
          const root = await navigator.storage.getDirectory();
          const handle = await root.getFileHandle(file.id, { create: true });
          if (handle.createWritable) {
            file.opfsHandle = await handle.createWritable();
          }
        } catch (e) {
          console.warn("OPFS stream failed, falling back to memory chunks", e);
        }
      }
    }

    if (message.type === "file-complete") {
      const file = incomingRef.current.get(message.fileId);
      if (!file) return;
      file.progress = 100;
      file.status = "done";
      
      if (file.opfsHandle) {
        try {
          await file.opfsHandle.close();
          const root = await navigator.storage.getDirectory();
          const handle = await root.getFileHandle(file.id);
          const blob = await handle.getFile();
          file.downloadUrl = URL.createObjectURL(blob);
        } catch (e) {
          console.error("Failed to read from OPFS", e);
        }
      } else {
        file.downloadUrl = URL.createObjectURL(new Blob(file.chunks, { type: file.type || "application/octet-stream" }));
      }
      
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

  async function emitWhenConnected(event: string, payload: Record<string, unknown>) {
    if (!SIGNAL_URL) return;
    const socket = socketRef.current;
    if (!socket) return;
    if (socket.connected) {
      socket.emit(event, payload);
      return;
    }
    socket.connect();
    await new Promise<void>((resolve) => {
      socket.once("connect", () => {
        resolve();
      });
    });
    socket.emit(event, payload);
  }

  async function stopQrScanner() {
    const scanner = qrScannerRef.current;
    if (!scanner) {
      setScannerActive(false);
      return;
    }

    try {
      if (scanner.isScanning) {
        await scanner.stop();
      }
      await scanner.clear();
    } catch {
      // Camera cleanup can throw if the browser already stopped the stream.
    } finally {
      qrScannerRef.current = null;
      setScannerActive(false);
    }
  }

  async function startQrScanner() {
    setActiveSection("connect");
    setScannerError("");

    if (!navigator.mediaDevices?.getUserMedia) {
      setScannerError("Camera scanning is not available in this browser.");
      return;
    }

    await stopQrScanner();
    const { Html5Qrcode } = await import("html5-qrcode");
    const scanner = new Html5Qrcode(QR_READER_ID);
    qrScannerRef.current = scanner;
    setScannerActive(true);

    try {
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        async (decodedText) => {
          const scannedCode = readRoomCodeFromQr(decodedText);
          if (!scannedCode) {
            setScannerError("That QR does not contain a PeerDash room code.");
            return;
          }

          setJoinCode(scannedCode);
          await stopQrScanner();
          await joinRoom(scannedCode);
        },
        () => undefined
      );
    } catch {
      setScannerError("Camera permission failed. Allow camera access and try again.");
      await stopQrScanner();
    }
  }

  async function createRoom() {
    const nextCode = makeRoomCode();
    destroyPeerConnection();
    setRole("sender");
    setActiveSection("connect");
    setRoomCode(nextCode);
    setJoinCode(nextCode);
    setState("signaling");
    setPeerName("Waiting for peer");
    setQrData(await makeQrData(`${window.location.origin}?room=${nextCode}`));
    setSocketReady(false);
    setStatusText("Creating secure room...");

    const peer = new Peer(`${PEER_PREFIX}${nextCode}`, PEER_OPTIONS);
    peerJsRef.current = peer;

    peer.on("open", async () => {
      setSocketReady(true);
      setStatusText("Room ready. Share the code or QR and wait for the receiver.");
      await emitWhenConnected("create-room", { roomCode: nextCode, peerName: deviceName });
    });

    peer.on("connection", (connection) => {
      setPeerName((connection.metadata as { peerName?: string } | undefined)?.peerName ?? "Receiver");
      setupPeerDataConnection(connection);
    });

    peer.on("error", () => {
      setState("error");
      setSocketReady(false);
      setStatusText("Could not create that room. Try again with a fresh code.");
    });
  }

  async function joinRoom(codeOverride?: string) {
    const activeCode = (codeOverride ?? joinCode).trim().toUpperCase();
    if (!activeCode) return;
    destroyPeerConnection();
    setRole("receiver");
    setActiveSection("connect");
    setRoomCode(activeCode);
    setState("signaling");
    setSocketReady(false);
    setStatusText("Joining room...");

    const peer = new Peer(undefined, PEER_OPTIONS);
    peerJsRef.current = peer;

    peer.on("open", async () => {
      const connection = peer.connect(`${PEER_PREFIX}${activeCode}`, {
        reliable: true,
        metadata: { peerName: deviceName }
      });
      setupPeerDataConnection(connection);
      await emitWhenConnected("join-room", { roomCode: activeCode, peerName: deviceName });
    });

    peer.on("error", () => {
      setState("error");
      setSocketReady(false);
      setStatusText("Could not join that room. Check the code and keep the sender page open.");
    });
  }

  async function installApp() {
    if (installPromptRef.current) {
      setInstallState("pending");
      await installPromptRef.current.prompt();
      const result = await installPromptRef.current.userChoice;
      setInstallState(result.outcome === "accepted" ? "installed" : "ready");
      if (result.outcome === "accepted") {
        setStatusText("PeerDash installed. You can launch it like a native app now.");
      }
      return;
    }

    if (window.matchMedia("(display-mode: standalone)").matches) {
      setInstallState("installed");
      setStatusText("PeerDash is already installed on this device.");
      return;
    }

    setInstallState("unavailable");
    setStatusText("Install is only available after the browser recognizes PeerDash as installable.");
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
    
    if (Capacitor.isNativePlatform()) {
      targets.forEach((file) => saveNativeFile(file));
    } else {
      targets.forEach((file) => {
        const a = document.createElement("a");
        a.href = file.downloadUrl!;
        a.download = file.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      });
    }
  }

  async function downloadSelectedAsZip() {
    const targets = incoming.filter(f => selectedIncoming.has(f.id) && f.status === "done");
    if (targets.length === 0) return;

    const zip = new JSZip();
    targets.forEach((file) => {
      if (file.chunks && file.chunks.length > 0) {
        const blob = new Blob(file.chunks, { type: file.type || "application/octet-stream" });
        zip.file(file.relativePath || file.name, blob);
      }
    });

    try {
      setStatusText("Generating ZIP archive... please wait.");
      const content = await zip.generateAsync({ type: "blob" });
      
      if (Capacitor.isNativePlatform()) {
        const reader = new FileReader();
        reader.readAsDataURL(content);
        reader.onloadend = async () => {
          const base64data = reader.result as string;
          const base64 = base64data.split(',')[1];
          try {
            await Filesystem.writeFile({
              path: `Download/PeerDash_${Date.now()}.zip`,
              data: base64,
              directory: Directory.ExternalStorage,
              recursive: true
            });
            alert(`Saved ZIP to Downloads folder.`);
            setStatusText("Transfer finished. Everything is ready to save.");
          } catch (e) {
            console.error(e);
            alert(`Failed to save ZIP`);
            setStatusText("Failed to save ZIP.");
          }
        };
      } else {
        saveAs(content, `PeerDash_${Date.now()}.zip`);
        setStatusText("Transfer finished. Everything is ready to save.");
      }
    } catch (e) {
      console.error("ZIP generation failed", e);
      alert("Failed to generate ZIP");
      setStatusText("Failed to generate ZIP.");
    }
  }

  async function saveNativeFile(file: IncomingFile) {
    if (!file.chunks || file.chunks.length === 0) return;
    const blob = new Blob(file.chunks, { type: file.type || "application/octet-stream" });
    const reader = new FileReader();
    reader.readAsDataURL(blob);
    reader.onloadend = async () => {
      const base64data = reader.result as string;
      const base64 = base64data.split(',')[1];
      try {
        await Filesystem.writeFile({
          path: `Download/PeerDash_${file.name}`,
          data: base64,
          directory: Directory.ExternalStorage,
          recursive: true
        });
        alert(`Saved ${file.name} to Downloads folder.`);
      } catch (e) {
        console.error(e);
        alert(`Failed to save ${file.name}`);
      }
    };
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
    sendControl({ type: "pause", fileId });
    setFiles((current) => current.map((item) => (item.id === fileId ? { ...item, status: "paused" } : item)));
  }

  function resumeFile(fileId: string) {
    sendPausedRef.current[fileId] = false;
    sendControl({ type: "resume", fileId });
    setFiles((current) => current.map((item) => (item.id === fileId ? { ...item, status: "queued" } : item)));
    void sendQueuedFiles();
  }

  function cancelFile(fileId: string) {
    sendPausedRef.current[fileId] = true;
    sendControl({ type: "cancel", fileId });
    setFiles((current) => current.map((item) => (item.id === fileId ? { ...item, status: "canceled" } : item)));
  }

  async function sendText() {
    if (!sharedText.trim()) return;
    sendControl({
      type: "text-share",
      text: sharedText.trim(),
      senderName: deviceName,
      createdAt: new Date().toISOString()
    });
    setReceivedTexts((current) => [`You: ${sharedText.trim()}`, ...current].slice(0, 6));
    setSharedText("");
  }

  async function waitForBuffer(channel: RTCDataChannel) {
    if (peerDataRef.current?.open) return;
    if (fallbackModeRef.current) return;
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
    const peerReady = Boolean(peerDataRef.current?.open);
    if (!peerReady && !fallbackModeRef.current && (!channelRef.current || channelRef.current.readyState !== "open" || activeSendRef.current)) return;
    if (activeSendRef.current) return;
    const activeFiles = files.filter((file) => file.status !== "canceled" && file.status !== "done");
    if (activeFiles.length === 0) return;

    activeSendRef.current = true;
    totalBytesRef.current = activeFiles.reduce((sum, file) => sum + (file.file.size - file.transferredBytes), 0);
    movedBytesRef.current = 0;
    speedWindowRef.current = [];

    sendControl({
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
    });

    if (note.trim()) {
      sendControl({ type: "transfer-note", text: note.trim(), senderName: deviceName });
    }

    setState("transferring");

    for (const item of activeFiles) {
      sendControl({ type: "file-start", fileId: item.id });
      setFiles((current) => current.map((file) => (file.id === item.id ? { ...file, status: "sending" } : file)));

      let offset = item.transferredBytes;
      while (offset < item.file.size) {
        if (sendPausedRef.current[item.id]) {
          await waitWhilePaused(item.id);
        }

        if (channelRef.current) {
          await waitForBuffer(channelRef.current);
        }

        const slice = item.file.slice(offset, offset + CHUNK_SIZE);
        const bytes = new Uint8Array(await slice.arrayBuffer());
        const idBytes = encoder.encode(item.id);
        const packet = new Uint8Array(1 + idBytes.length + bytes.length);
        packet[0] = idBytes.length;
        packet.set(idBytes, 1);
        packet.set(bytes, 1 + idBytes.length);
        sendData(packet);

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

      sendControl({ type: "file-complete", fileId: item.id });
    }

    sendControl({ type: "transfer-complete" });
    setState("done");
    setStatusText("Batch sent. The receiver can save each finished item instantly.");
    playBeep(523, 100, isMuted);
    setTimeout(() => playBeep(659, 150, isMuted), 150);
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

  const sections: Array<{ id: AppSection; label: string; meta: string }> = [
    { id: "connect", label: "Connect", meta: roomCode || "No room" },
    { id: "send", label: "Send", meta: `${files.length} files` },
    { id: "receive", label: "Receive", meta: `${incoming.length} items` },
    { id: "tools", label: "Tools", meta: receivedTexts.length ? `${receivedTexts.length} notes` : "Notes" },
    { id: "history", label: "History", meta: `${history.length} recent` }
  ];

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
          <div className="actions" style={{ marginTop: '1rem' }}>
            <button onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}>
              {theme === 'dark' ? '☀️ Light Mode' : '🌙 Dark Mode'}
            </button>
            <button onClick={() => setIsMuted(m => !m)}>
              {isMuted ? '🔇 Unmute' : '🔊 Mute'}
            </button>
            <button onClick={installApp}>
              {installState === "installed"
                ? "App installed"
                : installState === "pending"
                  ? "Install pending"
                  : installState === "ready"
                    ? "Install app"
                    : "Install unavailable"}
            </button>
          </div>
        </div>
        <div className="hero-card">
          <div className="status-pill">{state.toUpperCase()}</div>
          <h2>{roomCode ? `Room ${roomCode}` : "No active room yet"}</h2>
          <p>{statusText}</p>
          <p className="muted">Signal server: {socketReady ? "online" : "reconnecting"}</p>
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

      <nav className="section-tabs" aria-label="PeerDash sections">
        {sections.map((section) => (
          <button
            key={section.id}
            className={activeSection === section.id ? "section-tab active" : "section-tab"}
            onClick={() => setActiveSection(section.id)}
          >
            <span>{section.label}</span>
            <small>{section.meta}</small>
          </button>
        ))}
      </nav>

      <main className="section-stage">
        {activeSection === "connect" ? (
        <section className="app-section">
          <div className="panel">
          <h3>Connect devices</h3>
          <label className="field">
            <span>Device name</span>
            <input value={deviceName} onChange={(event) => setDeviceName(event.target.value)} />
          </label>
          <div className="actions">
            <button className="primary" onClick={createRoom}>Create sender room</button>
            <button onClick={joinRoom}>Join as receiver</button>
            <button onClick={scannerActive ? stopQrScanner : startQrScanner}>
              {scannerActive ? "Stop camera" : "Scan QR"}
            </button>
          </div>
          <label className="field">
            <span>Join code</span>
            <input value={joinCode} onChange={(event) => setJoinCode(event.target.value.toUpperCase())} placeholder="ABC123" />
          </label>
          <div className={scannerActive ? "scanner-wrap active" : "scanner-wrap"}>
            <div id={QR_READER_ID} className="scanner-view" />
          </div>
          {scannerError ? <p className="muted scanner-error">{scannerError}</p> : null}
          {qrData ? <img className="qr" src={qrData} alt="Room QR" /> : null}
          <p className="muted">Peer: {peerName}</p>
        </div>
        </section>
        ) : null}

        {activeSection === "tools" ? (
        <section className="app-section">
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
        ) : null}

        {activeSection === "send" ? (
        <section className="app-section">
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
        </section>
        ) : null}

        {activeSection === "receive" ? (
        <section className="app-section">
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
              <button onClick={downloadSelectedAsZip} disabled={selectedIncoming.size === 0 || !incoming.some(f => selectedIncoming.has(f.id) && f.status === "done")}>
                Download as ZIP
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
                  {file.downloadUrl && !Capacitor.isNativePlatform() ? <a className="download" href={file.downloadUrl} download={file.name}>Save</a> : null}
                  {file.downloadUrl && Capacitor.isNativePlatform() ? <button className="download" onClick={() => saveNativeFile(file)}>Save</button> : null}
                </div>
              </article>
            )})}
          </div>
        </div>
        </section>
        ) : null}

        {activeSection === "history" ? (
        <section className="app-section">
          <div className="panel">
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
        </div>
        </section>
        ) : null}
      </main>
    </div>
  );
}

export default App;
