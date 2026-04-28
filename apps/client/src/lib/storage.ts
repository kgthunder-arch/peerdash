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
