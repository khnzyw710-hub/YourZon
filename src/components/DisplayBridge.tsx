"use client";

import { useEffect, useRef } from "react";
import { sendDisplayMessage, createChannel } from "@/lib/broadcast";
import type { DisplayMessage } from "@/lib/broadcast";

export function DisplayBridge() {
  const lastPath = useRef("");

  useEffect(() => {
    const channel = createChannel();
    if (!channel) return;

    channel.onmessage = (e: MessageEvent<DisplayMessage>) => {
      if (e.data.type === "ping") {
        sendDisplayMessage("pong");
      }
    };

    function broadcast() {
      const path = window.location.pathname + window.location.search;
      if (path === lastPath.current) return;
      lastPath.current = path;

      const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
      const cleanPath = basePath ? path.replace(basePath, "") : path;

      const businessMatch = cleanPath.match(/^\/business\/(.+?)\/?$/);
      if (businessMatch) {
        setTimeout(() => {
          sendDisplayMessage("business-view", {
            slug: businessMatch[1],
            ...extractBusinessData(),
          });
        }, 300);
        return;
      }

      const categoryMatch = cleanPath.match(/^\/category\/(.+?)\/?$/);
      if (categoryMatch) {
        setTimeout(() => {
          sendDisplayMessage("category-view", {
            slug: categoryMatch[1],
            ...extractHeading(),
          });
        }, 300);
        return;
      }

      const cityMatch = cleanPath.match(/^\/city\/(.+?)\/?$/);
      if (cityMatch) {
        setTimeout(() => {
          sendDisplayMessage("city-view", {
            city: decodeURIComponent(cityMatch[1]),
            ...extractHeading(),
          });
        }, 300);
        return;
      }

      const searchParams = new URLSearchParams(window.location.search);
      if (cleanPath.startsWith("/search") && searchParams.get("q")) {
        sendDisplayMessage("search", { query: searchParams.get("q") });
        return;
      }

      sendDisplayMessage("home");
    }

    broadcast();

    window.addEventListener("popstate", broadcast);

    document.addEventListener("click", (e) => {
      const anchor = (e.target as HTMLElement).closest("a");
      if (anchor && anchor.href && anchor.origin === window.location.origin) {
        setTimeout(broadcast, 100);
      }
    });

    const observer = new MutationObserver(() => {
      setTimeout(broadcast, 200);
    });
    observer.observe(document.querySelector("main") || document.body, {
      childList: true,
    });

    return () => {
      observer.disconnect();
      window.removeEventListener("popstate", broadcast);
      channel.close();
    };
  }, []);

  return null;
}

function extractBusinessData() {
  try {
    const name = document.querySelector("h1")?.textContent || "";
    const subtitle = document.querySelector("h1")
      ?.parentElement?.querySelector("p")?.textContent || "";
    const ratingEl = document.querySelector(
      ".text-3xl.font-bold.text-brand-600"
    );
    const rating = ratingEl?.textContent || "";
    const desc = document.querySelector(".leading-relaxed")?.textContent || "";
    const img = document.querySelector("main img")?.getAttribute("src") || "";
    const verified = !!document.querySelector(".bg-green-100");

    const phone =
      document.querySelector("a[href^='tel:']")?.textContent || "";
    const addressEl = document.querySelector("main .space-y-3 .flex.gap-2:nth-child(2) span:last-child");
    const address = addressEl?.textContent || "";

    return { name, subtitle, rating, desc, img, verified, phone, address };
  } catch {
    return {};
  }
}

function extractHeading() {
  try {
    const title = document.querySelector("h1")?.textContent || "";
    const count =
      document.querySelector("h1 + p, h1 ~ p")?.textContent || "";
    return { title, count };
  } catch {
    return {};
  }
}
