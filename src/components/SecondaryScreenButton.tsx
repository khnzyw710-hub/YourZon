"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  createChannel,
  sendDisplayMessage,
  setPresentationConnection,
  getDisplayUrl,
} from "@/lib/broadcast";
import type { DisplayMessage } from "@/lib/broadcast";

export function SecondaryScreenButton() {
  const [connected, setConnected] = useState(false);
  const [casting, setCasting] = useState(false);
  const presentationRef = useRef<PresentationConnection | null>(null);

  const checkBroadcastConnection = useCallback(() => {
    const channel = createChannel();
    if (!channel) return;

    let timeout: ReturnType<typeof setTimeout>;

    channel.onmessage = (e: MessageEvent<DisplayMessage>) => {
      if (e.data.type === "pong") {
        setConnected(true);
        clearTimeout(timeout);
        channel.close();
      }
    };

    sendDisplayMessage("ping");

    timeout = setTimeout(() => {
      if (!casting) setConnected(false);
      channel.close();
    }, 1000);
  }, [casting]);

  useEffect(() => {
    checkBroadcastConnection();
    const interval = setInterval(checkBroadcastConnection, 5000);
    return () => clearInterval(interval);
  }, [checkBroadcastConnection]);

  async function startPresentation() {
    const url = getDisplayUrl();

    if ("presentation" in navigator && "PresentationRequest" in window) {
      try {
        const request = new PresentationRequest([url]);
        const conn = await request.start();
        presentationRef.current = conn;
        setPresentationConnection(conn);
        setCasting(true);
        setConnected(true);

        conn.onclose = () => {
          setCasting(false);
          setConnected(false);
          setPresentationConnection(null);
          presentationRef.current = null;
        };

        conn.onterminate = () => {
          setCasting(false);
          setConnected(false);
          setPresentationConnection(null);
          presentationRef.current = null;
        };

        return;
      } catch {
        // Presentation API not available or user cancelled - fall through to window.open
      }
    }

    window.open(url, "yourzon-display", "noopener");
    setTimeout(checkBroadcastConnection, 1500);
  }

  function stopPresentation() {
    if (presentationRef.current) {
      try {
        presentationRef.current.terminate();
      } catch {}
      presentationRef.current = null;
      setPresentationConnection(null);
    }
    setCasting(false);
    setConnected(false);
  }

  return (
    <button
      onClick={casting ? stopPresentation : startPresentation}
      className={`flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border transition-colors ${
        casting
          ? "bg-brand-50 border-brand-300 text-brand-700"
          : "hover:bg-gray-50"
      }`}
      title={casting ? "נתק מסך משני" : "שדר למסך משני"}
    >
      <span className="text-base">{casting ? "📡" : "📺"}</span>
      <span className="hidden sm:inline">
        {casting ? "משדר" : "מסך משני"}
      </span>
      <span
        className={`w-2 h-2 rounded-full ${
          connected ? "bg-green-500" : "bg-gray-300"
        }`}
      />
    </button>
  );
}
