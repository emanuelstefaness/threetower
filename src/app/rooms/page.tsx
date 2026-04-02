import { Suspense } from "react";
import dynamic from "next/dynamic";

const TowerAlfaRoomsClient = dynamic(() => import("@/features/dashboard/TowerAlfaRoomsClient"), {
  ssr: false,
});

export default function RoomsPage() {
  return (
    <Suspense fallback={<div style={{ padding: 24, color: "#94a3b8" }}>Carregando…</div>}>
      <TowerAlfaRoomsClient />
    </Suspense>
  );
}

