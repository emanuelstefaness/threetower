import dynamic from "next/dynamic";

const NichosClient = dynamic(() => import("@/features/dashboard/NichosClient"), {
  ssr: false,
});

export default function Page() {
  return <NichosClient />;
}
