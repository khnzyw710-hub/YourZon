interface PresentationRequest {
  new (urls: string[]): PresentationRequest;
  start(): Promise<PresentationConnection>;
  reconnect(presentationId: string): Promise<PresentationConnection>;
}

interface PresentationConnection {
  id: string;
  url: string;
  state: "connecting" | "connected" | "closed" | "terminated";
  send(data: string): void;
  close(): void;
  terminate(): void;
  onconnect: ((this: PresentationConnection, ev: Event) => any) | null;
  onclose: ((this: PresentationConnection, ev: Event) => any) | null;
  onterminate: ((this: PresentationConnection, ev: Event) => any) | null;
  onmessage: ((this: PresentationConnection, ev: MessageEvent) => any) | null;
}

interface Presentation {
  defaultRequest: PresentationRequest | null;
  receiver: PresentationReceiver;
}

interface PresentationReceiver {
  connectionList: Promise<PresentationConnectionList>;
}

interface PresentationConnectionList {
  connections: readonly PresentationConnection[];
  onconnectionavailable: ((this: PresentationConnectionList, ev: any) => any) | null;
}

declare var PresentationRequest: {
  prototype: PresentationRequest;
  new (urls: string[]): PresentationRequest;
};

interface Navigator {
  presentation?: Presentation;
}
