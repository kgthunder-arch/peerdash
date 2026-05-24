export type HistoryItem = {
  id: string;
  roomCode: string;
  direction: "sent" | "received";
  names: string[];
  totalBytes: number;
  createdAt: string;
  peerLabel: string;
};

const KEY = "peerdash-history";
const DEVICE_KEY = "peerdash-device-name";

export function readHistory(): HistoryItem[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as HistoryItem[]) : [];
  } catch {
    return [];
  }
}

export function appendHistory(item: HistoryItem) {
  const next = [item, ...readHistory()].slice(0, 12);
  localStorage.setItem(KEY, JSON.stringify(next));
}

export function clearHistory() {
  localStorage.removeItem(KEY);
}

/** Returns the persisted device name, generating and saving one on first call. */
export function getDeviceName(): string {
  try {
    const stored = localStorage.getItem(DEVICE_KEY);
    if (stored) return stored;
    const generated = `Device-${Math.floor(Math.random() * 900 + 100)}`;
    localStorage.setItem(DEVICE_KEY, generated);
    return generated;
  } catch {
    return `Device-${Math.floor(Math.random() * 900 + 100)}`;
  }
}

/** Persists a new device name chosen by the user. */
export function setDeviceName(name: string): void {
  try {
    localStorage.setItem(DEVICE_KEY, name);
  } catch {
    // Silently ignore storage errors (private browsing, quota exceeded)
  }
}
