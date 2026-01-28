"use client";

import React, { useCallback, useState } from "react";

type ToastKind = "success" | "error" | "info";
export type Toast = { id: string; kind: ToastKind; message: string };

function nowId() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function useSimpleToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const pushToast = useCallback((kind: ToastKind, message: string) => {
    const id = nowId();
    setToasts((t) => [...t, { id, kind, message }]);
    setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id));
    }, 4500);
  }, []);

  return { toasts, pushToast };
}

export function SimpleToastsView({ toasts }: { toasts: Toast[] }) {
  return (
    <div
      style={{
        position: "fixed",
        top: 18,
        right: 18,
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          style={{
            padding: "10px 12px",
            borderRadius: 14,
            border: "1px solid rgba(255,255,255,0.12)",
            background:
              t.kind === "success"
                ? "rgba(40, 180, 120, 0.18)"
                : t.kind === "error"
                ? "rgba(255, 80, 80, 0.18)"
                : "rgba(255,255,255,0.10)",
            color: "white",
            maxWidth: 320,
            fontWeight: 700,
          }}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
