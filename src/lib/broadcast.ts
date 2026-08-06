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

let presentationConnection: PresentationConnection | null = null;

export function setPresentationConnection(conn: PresentationConnection | null) {
  presentationConnection = conn;
}

export function getPresentationConnection() {
  return presentationConnection;
}

export function createChannel(): BroadcastChannel | null {
  if (typeof window === "undefined") return null;
  try {
    return new BroadcastChannel(CHANNEL_NAME);
  } catch {
    return null;
  }
}

export function sendDisplayMessage(type: DisplayMessageType, payload?: any) {
  const msg: DisplayMessage = { type, payload, timestamp: Date.now() };
  const json = JSON.stringify(msg);

  if (presentationConnection && presentationConnection.state === "connected") {
    try {
      presentationConnection.send(json);
    } catch {}
  }

  const channel = createChannel();
  if (channel) {
    channel.postMessage(msg);
    channel.close();
  }
}

export function getDisplayUrl(): string {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
  return `${window.location.origin}${basePath}/display/`;
}
