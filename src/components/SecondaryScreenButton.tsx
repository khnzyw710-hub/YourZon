"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createChannel, sendDisplayMessage } from "@/lib/broadcast";
import type { DisplayMessage } from "@/lib/broadcast";

type ScreenState = "no-screen" | "detected" | "connected";

export function SecondaryScreenButton() {
  const [screenState, setScreenState] = useState<ScreenState>("no-screen");
  const [showSetup, setShowSetup] = useState(false);
  const displayWindow = useRef<Window | null>(null);
  const screenDetailsRef = useRef<any>(null);

  useEffect(() => {
    detectScreens();
    const interval = setInterval(pollConnection, 3000);
    return () => clearInterval(interval);
  }, []);

  async function detectScreens() {
    if (!("getScreenDetails" in window)) return;
    try {
      const details = await (window as any).getScreenDetails();
      screenDetailsRef.current = details;
      if (details.screens.length > 1) {
        setScreenState("detected");
      }
      details.addEventListener("screenschange", () => {
        const hasSecond = details.screens.length > 1;
        setScreenState((prev) => {
          if (!hasSecond) {
            if (displayWindow.current && !displayWindow.current.closed) {
              displayWindow.current.close();
            }
            displayWindow.current = null;
            return "no-screen";
          }
          return prev === "connected" ? "connected" : "detected";
        });
      });
    } catch {}
  }

  function pollConnection() {
    if (displayWindow.current && !displayWindow.current.closed) {
      setScreenState("connected");
      return;
    }
    if (displayWindow.current) {
      displayWindow.current = null;
      setScreenState((prev) => (prev === "connected" ? "detected" : prev));
    }
  }

  async function launchOnTablet() {
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
    const url = `${basePath}/display/`;

    const details = screenDetailsRef.current;
    if (details && details.screens.length > 1) {
      const current = details.currentScreen;
      const tablet = details.screens.find((s: any) => s !== current);
      if (tablet) {
        const w = window.open(
          url,
          "yourzon-display",
          `left=${tablet.availLeft},top=${tablet.availTop},width=${tablet.availWidth},height=${tablet.availHeight}`
        );
        if (w) {
          displayWindow.current = w;
          setScreenState("connected");
          return;
        }
      }
    }

    const w = window.open(url, "yourzon-display");
    if (w) {
      displayWindow.current = w;
      setScreenState("connected");
    }
  }

  function disconnect() {
    if (displayWindow.current && !displayWindow.current.closed) {
      displayWindow.current.close();
    }
    displayWindow.current = null;
    setScreenState(
      screenDetailsRef.current?.screens?.length > 1 ? "detected" : "no-screen"
    );
  }

  const label =
    screenState === "connected"
      ? "מחובר לטאבלט"
      : screenState === "detected"
      ? "שדר לטאבלט"
      : "מסך משני";

  const dotColor =
    screenState === "connected"
      ? "bg-green-500"
      : screenState === "detected"
      ? "bg-yellow-400 animate-pulse"
      : "bg-gray-300";

  return (
    <div className="relative">
      <button
        onClick={
          screenState === "connected"
            ? disconnect
            : screenState === "detected"
            ? launchOnTablet
            : () => setShowSetup(!showSetup)
        }
        className={`flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border transition-colors ${
          screenState === "connected"
            ? "bg-brand-50 border-brand-300 text-brand-700"
            : "hover:bg-gray-50"
        }`}
      >
        <span className="text-base">
          {screenState === "connected" ? "📡" : "📺"}
        </span>
        <span className="hidden sm:inline">{label}</span>
        <span className={`w-2 h-2 rounded-full ${dotColor}`} />
      </button>

      {showSetup && screenState === "no-screen" && (
        <div className="absolute left-0 top-full mt-2 w-72 bg-white rounded-xl shadow-lg border p-4 z-50 text-right">
          <h3 className="font-bold text-sm mb-2">חיבור טאבלט כמסך משני</h3>
          <ol className="text-xs text-gray-600 space-y-2 list-decimal list-inside">
            <li>
              התקן את{" "}
              <a
                href="https://apps.microsoft.com/detail/9pltxw5dx5kb"
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-600 underline"
              >
                Samsung Second Screen
              </a>{" "}
              במחשב מ-Microsoft Store
            </li>
            <li>ודא שהמחשב והטאבלט על אותה רשת Wi-Fi</li>
            <li>בטאבלט, פתח הגדרות מהירות ולחץ על &quot;מסך שני&quot;</li>
            <li>חבר מאפליקציית Second Screen במחשב</li>
            <li>חזור לכאן ולחץ &quot;שדר לטאבלט&quot;</li>
          </ol>
          <button
            onClick={() => setShowSetup(false)}
            className="mt-3 text-xs text-gray-400 hover:text-gray-600"
          >
            סגור
          </button>
        </div>
      )}
    </div>
  );
}
