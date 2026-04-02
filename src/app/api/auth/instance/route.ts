import { getServerInstanceId } from "@/server/auth/serverInstance";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Só em desenvolvimento: permite ao middleware validar se o JWT ainda pertence a este arranque do servidor. */
export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return Response.json({ error: "Não disponível" }, { status: 404 });
  }
  return Response.json({ sid: getServerInstanceId() });
}
