export type DisplayMessageType =
  | "navigate"
  | "business-view"
  | "category-view"
  | "city-view"
  | "search"
  | "home"
  | "ping"
  | "pong";

export interface DisplayMessage {
  type: DisplayMessageType;
  payload?: any;
  timestamp: number;
}

const CHANNEL_NAME = "yourzon-display";

export function createChannel(): BroadcastChannel | null {
  if (typeof window === "undefined") return null;
  try {
    return new BroadcastChannel(CHANNEL_NAME);
  } catch {
    return null;
  }
}

export function sendDisplayMessage(type: DisplayMessageType, payload?: any) {
  const channel = createChannel();
  if (!channel) return;
  const msg: DisplayMessage = { type, payload, timestamp: Date.now() };
  channel.postMessage(msg);
  channel.close();
}
