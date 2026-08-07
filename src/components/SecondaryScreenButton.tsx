"use client";

import { useState } from "react";

export function SecondaryScreenButton() {
  const [open, setOpen] = useState(false);

  function launch() {
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
    const w = window.open(`${basePath}/display/`, "yourzon-display");
    if (w) setOpen(true);
  }

  return (
    <button
      onClick={launch}
      className={`flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border transition-colors ${
        open ? "bg-brand-50 border-brand-300 text-brand-700" : "hover:bg-gray-50"
      }`}
    >
      <span className="text-base">📺</span>
      <span className="hidden sm:inline">{open ? "מסך משני פעיל" : "מסך משני"}</span>
    </button>
  );
}
