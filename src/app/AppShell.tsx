"use client";

import type { ReactNode } from "react";
import { IdleTvPanelOverlay } from "@/features/dashboard/IdleTvPanelOverlay";

export default function AppShell({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <IdleTvPanelOverlay />
    </>
  );
}
