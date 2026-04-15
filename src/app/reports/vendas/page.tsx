import dynamic from "next/dynamic";

const TowerAlfaVendasMensaisClient = dynamic(() => import("@/features/dashboard/TowerAlfaVendasMensaisClient"), {
  ssr: false,
});

export default function ReportsVendasPage() {
  return <TowerAlfaVendasMensaisClient />;
}
