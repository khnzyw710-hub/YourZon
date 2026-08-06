"use client";

import { useState, useEffect, useCallback } from "react";
import { createChannel, sendDisplayMessage } from "@/lib/broadcast";
import type { DisplayMessage } from "@/lib/broadcast";

export function SecondaryScreenButton() {
  const [connected, setConnected] = useState(false);

  const checkConnection = useCallback(() => {
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
      setConnected(false);
      channel.close();
    }, 1000);
  }, []);

  useEffect(() => {
    checkConnection();
    const interval = setInterval(checkConnection, 5000);
    return () => clearInterval(interval);
  }, [checkConnection]);

  function openDisplay() {
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
    window.open(`${basePath}/display/`, "yourzon-display", "noopener");
    setTimeout(checkConnection, 1500);
  }

  return (
    <button
      onClick={openDisplay}
      className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border transition-colors hover:bg-gray-50"
      title={connected ? "מסך משני מחובר" : "פתח מסך משני"}
    >
      <span className="text-base">📺</span>
      <span className="hidden sm:inline">
        {connected ? "מסך משני" : "מסך משני"}
      </span>
      <span
        className={`w-2 h-2 rounded-full ${
          connected ? "bg-green-500" : "bg-gray-300"
        }`}
      />
    </button>
  );
}
