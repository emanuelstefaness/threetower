import dynamic from "next/dynamic";

const TowerAlfaDashboardClient = dynamic(() => import("@/features/dashboard/TowerAlfaDashboardClient"), {
  ssr: false,
});

export default function Page() {
  return <TowerAlfaDashboardClient />;
}

