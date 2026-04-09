import dynamic from "next/dynamic";

const TowerAlfaPanelClient = dynamic(() => import("@/features/dashboard/TowerAlfaPanelClient"), {
  ssr: false,
});

export default function PanelPage() {
  return <TowerAlfaPanelClient />;
}
