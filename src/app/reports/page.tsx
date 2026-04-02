import dynamic from "next/dynamic";

const TowerAlfaReportsClient = dynamic(() => import("@/features/dashboard/TowerAlfaReportsClient"), {
  ssr: false,
});

export default function ReportsPage() {
  return <TowerAlfaReportsClient />;
}

