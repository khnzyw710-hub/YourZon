"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createChannel, sendDisplayMessage } from "@/lib/broadcast";
import type { DisplayMessage } from "@/lib/broadcast";

export function SecondaryScreenButton() {
  const [connected, setConnected] = useState(false);
  const [hasSecondScreen, setHasSecondScreen] = useState(false);
  const displayWindow = useRef<Window | null>(null);

  useEffect(() => {
    detectScreens();
  }, []);

  async function detectScreens() {
    if ("getScreenDetails" in window) {
      try {
        const details = await (window as any).getScreenDetails();
        setHasSecondScreen(details.screens.length > 1);
        details.addEventListener("screenschange", () => {
          setHasSecondScreen(details.screens.length > 1);
        });
      } catch {}
    }
  }

  const checkConnection = useCallback(() => {
    if (displayWindow.current && !displayWindow.current.closed) {
      setConnected(true);
      return;
    }
    setConnected(false);
    displayWindow.current = null;

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
    timeout = setTimeout(() => { channel.close(); }, 1000);
  }, []);

  useEffect(() => {
    checkConnection();
    const interval = setInterval(checkConnection, 5000);
    return () => clearInterval(interval);
  }, [checkConnection]);

  async function openOnSecondScreen() {
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
    const url = `${basePath}/display/`;

    if ("getScreenDetails" in window) {
      try {
        const details = await (window as any).getScreenDetails();
        const current = details.currentScreen;
        const second = details.screens.find((s: any) => s !== current);

        if (second) {
          const w = window.open(
            url,
            "yourzon-display",
            `left=${second.availLeft},top=${second.availTop},width=${second.availWidth},height=${second.availHeight}`
          );
          if (w) {
            displayWindow.current = w;
            setConnected(true);
            w.addEventListener("load", () => {
              try { w.document.documentElement.requestFullscreen(); } catch {}
            });
            setTimeout(checkConnection, 1500);
            return;
          }
        }
      } catch {}
    }

    const w = window.open(url, "yourzon-display");
    if (w) {
      displayWindow.current = w;
      setConnected(true);
    }
    setTimeout(checkConnection, 1500);
  }

  function disconnect() {
    if (displayWindow.current && !displayWindow.current.closed) {
      displayWindow.current.close();
    }
    displayWindow.current = null;
    setConnected(false);
  }

  return (
    <button
      onClick={connected ? disconnect : openOnSecondScreen}
      className={`flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border transition-colors ${
        connected
          ? "bg-brand-50 border-brand-300 text-brand-700"
          : "hover:bg-gray-50"
      }`}
      title={connected ? "נתק מסך משני" : "פתח על מסך משני"}
    >
      <span className="text-base">{connected ? "📡" : "📺"}</span>
      <span className="hidden sm:inline">
        {connected ? "מחובר" : hasSecondScreen ? "שדר לטאבלט" : "מסך משני"}
      </span>
      <span
        className={`w-2 h-2 rounded-full ${
          connected ? "bg-green-500" : hasSecondScreen ? "bg-yellow-400" : "bg-gray-300"
        }`}
      />
    </button>
  );
}
