import dynamic from "next/dynamic";

const HistoricoClient = dynamic(() => import("@/features/dashboard/HistoricoClient"), {
  ssr: false,
});

export default function Page() {
  return <HistoricoClient />;
}
