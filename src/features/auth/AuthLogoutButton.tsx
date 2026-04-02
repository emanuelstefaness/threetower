"use client";

import { useBuildingStoreClient } from "@/features/building/buildingStoreClient";

export function AuthLogoutButton() {
  const authEnabled = useBuildingStoreClient((s) => s.authEnabled);
  if (!authEnabled) return null;

  return (
    <button
      type="button"
      className="auth-logout-btn"
      onClick={async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        window.location.href = "/login";
      }}
    >
      Sair
    </button>
  );
}
