"use client";

import { useEffect } from "react";

export function TabletRedirect() {
  useEffect(() => {
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
    const isDisplayPage = window.location.pathname.replace(basePath, "").startsWith("/display");
    if (isDisplayPage) return;

    const hasTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
    const minDim = Math.min(window.screen.width, window.screen.height);
    const maxDim = Math.max(window.screen.width, window.screen.height);
    const isTabletSize = minDim >= 600 && maxDim <= 1400;

    if (hasTouch && isTabletSize) {
      window.location.replace(`${basePath}/display/`);
    }
  }, []);

  return null;
}
