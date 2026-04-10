"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { canAccessTvPanel } from "@/lib/authUi";

const TowerAlfaPanelClient = dynamic(() => import("@/features/dashboard/TowerAlfaPanelClient"), {
  ssr: false,
});

const IDLE_MS = 15_000;
const TICK_MS = 1000;
const THROTTLE_MS = 400;

const ACTIVITY_EVENTS = ["mousemove", "mousedown", "keydown", "scroll", "touchstart", "wheel"] as const;

/**
 * Após inatividade, abre o Painel TV em fullscreen; qualquer interação fecha.
 * Só ativo para quem pode aceder a `/panel` (ex.: login dubena). Não corre em `/login` nem em `/panel`.
 */
export function IdleTvPanelOverlay() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [authLogin, setAuthLogin] = useState<string | null | undefined>(undefined);
  const lastActivityRef = useRef(Date.now());
  const throttleRef = useRef(0);

  useEffect(() => {
    let alive = true;
    fetch("/api/state", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!alive) return;
        setAuthLogin(typeof d?.authLogin === "string" ? d.authLogin : null);
      })
      .catch(() => alive && setAuthLogin(null));
    return () => {
      alive = false;
    };
  }, [pathname]);

  const bumpActivity = useCallback(() => {
    const now = Date.now();
    if (open) {
      setOpen(false);
      lastActivityRef.current = now;
      throttleRef.current = now;
      return;
    }
    if (now - throttleRef.current < THROTTLE_MS) return;
    throttleRef.current = now;
    lastActivityRef.current = now;
  }, [open]);

  useEffect(() => {
    if (authLogin === undefined) return;
    if (!canAccessTvPanel(authLogin)) return;
    const path = pathname ?? "";
    if (path.startsWith("/login")) return;
    if (path.startsWith("/panel")) return;

    const onAct = () => bumpActivity();
    for (const ev of ACTIVITY_EVENTS) {
      window.addEventListener(ev, onAct, { passive: true });
    }
    const tick = window.setInterval(() => {
      if (Date.now() - lastActivityRef.current >= IDLE_MS) {
        setOpen(true);
      }
    }, TICK_MS);

    return () => {
      for (const ev of ACTIVITY_EVENTS) {
        window.removeEventListener(ev, onAct);
      }
      window.clearInterval(tick);
    };
  }, [authLogin, pathname, bumpActivity]);

  if (!open) return null;

  return (
    <div className="idle-tv-root" role="dialog" aria-label="Painel TV — inatividade" aria-modal="true">
      <TowerAlfaPanelClient />
      <style jsx global>{`
        .idle-tv-root {
          position: fixed;
          inset: 0;
          z-index: 99999;
          overflow: hidden;
        }
      `}</style>
    </div>
  );
}
