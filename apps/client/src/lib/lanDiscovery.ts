/**
 * LAN Discovery via BroadcastChannel API.
 *
 * Devices on the same browser origin (same LAN + same browser profile, or
 * multiple tabs) can discover each other without a signaling server.
 *
 * For cross-device LAN discovery we use a mDNS-like approach:
 * - Devices broadcast a "hello" message on a shared BroadcastChannel.
 * - Other devices respond with their room code and device name.
 * - The UI shows discovered peers for one-click joining.
 *
 * Note: BroadcastChannel only works within the same browser origin.
 * True cross-device LAN discovery requires a native app or a local HTTP
 * server (not available in a pure web context due to CORS/security).
 */

export interface LanPeer {
  deviceName: string;
  roomCode: string;
  timestamp: number;
}

type LanMessage =
  | { type: "hello"; deviceName: string; roomCode: string }
  | { type: "bye"; deviceName: string };

const CHANNEL_NAME = "peerdash-lan";
const PEER_TTL_MS = 30_000; // 30 seconds

export class LanDiscovery {
  private channel: BroadcastChannel | null = null;
  private peers = new Map<string, LanPeer>();
  private onPeersChange: (peers: LanPeer[]) => void;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(onPeersChange: (peers: LanPeer[]) => void) {
    this.onPeersChange = onPeersChange;
  }

  start(deviceName: string, roomCode: string) {
    if (!("BroadcastChannel" in window)) return;

    this.channel = new BroadcastChannel(CHANNEL_NAME);

    this.channel.onmessage = (event: MessageEvent<LanMessage>) => {
      const msg = event.data;
      if (msg.type === "hello") {
        this.peers.set(msg.deviceName, {
          deviceName: msg.deviceName,
          roomCode: msg.roomCode,
          timestamp: Date.now()
        });
        this.onPeersChange(this.getPeers());
        // Respond so the new peer knows about us
        this.channel?.postMessage({ type: "hello", deviceName, roomCode } satisfies LanMessage);
      } else if (msg.type === "bye") {
        this.peers.delete(msg.deviceName);
        this.onPeersChange(this.getPeers());
      }
    };

    // Announce ourselves
    this.channel.postMessage({ type: "hello", deviceName, roomCode } satisfies LanMessage);

    // Periodic re-announce + stale peer cleanup
    this.cleanupTimer = setInterval(() => {
      const now = Date.now();
      for (const [key, peer] of this.peers) {
        if (now - peer.timestamp > PEER_TTL_MS) {
          this.peers.delete(key);
        }
      }
      this.onPeersChange(this.getPeers());
      this.channel?.postMessage({ type: "hello", deviceName, roomCode } satisfies LanMessage);
    }, 10_000);
  }

  stop(deviceName: string) {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
    this.channel?.postMessage({ type: "bye", deviceName } satisfies LanMessage);
    this.channel?.close();
    this.channel = null;
    this.peers.clear();
    this.onPeersChange([]);
  }

  getPeers(): LanPeer[] {
    return Array.from(this.peers.values());
  }
}
