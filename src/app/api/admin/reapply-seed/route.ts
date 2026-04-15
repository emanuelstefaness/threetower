import { createHash, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { getBuildingStore } from "@/server/building/buildingStore";
import { generateBuildingFromSeed } from "@/server/building/generateBuilding";
import type { SeedRoom } from "@/server/building/generateBuilding";
import { persistSnapshotNow } from "@/server/building/loadPersisted";
import { isPersistenceEnabled } from "@/server/building/persistBuildingState";
import treeTowerSeed from "@/server/building/treeTowerSeed.json";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function hashPw(s: string): Buffer {
  return createHash("sha256").update(s, "utf8").digest();
}

function syncSecretOk(header: string | null): boolean {
  const expected = process.env.EXCEL_SYNC_SECRET?.trim();
  if (!expected) return false;
  const raw = header?.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!raw) return false;
  const ha = hashPw(raw);
  const hb = hashPw(expected);
  if (ha.length !== hb.length) return false;
  return timingSafeEqual(ha, hb);
}

/**
 * Alinha Neon/ficheiro ao **`treeTowerSeed.json` do repositório** (snapshot de referência no Git).
 * Use quando quiser repor o estado inicial a partir do JSON — o dia a dia continua na persistência e na UI.
 *
 * `Authorization: Bearer <EXCEL_SYNC_SECRET>` (igual ao sync-excel).
 */
export async function POST(req: Request) {
  if (!process.env.EXCEL_SYNC_SECRET?.trim()) {
    return NextResponse.json(
      { error: "EXCEL_SYNC_SECRET não configurado no servidor" },
      { status: 501 }
    );
  }

  if (!syncSecretOk(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  if (!isPersistenceEnabled()) {
    return NextResponse.json(
      { error: "Persistência desativada (BUILDING_PERSISTENCE) — nada a gravar" },
      { status: 503 }
    );
  }

  const seed = treeTowerSeed as SeedRoom[];
  const snapshot = generateBuildingFromSeed(seed);
  const store = await getBuildingStore();
  store.replaceSnapshotFromImport(snapshot);
  await persistSnapshotNow(store.getState());

  return NextResponse.json({
    ok: true,
    roomsTotal: snapshot.summary.totalRooms,
    message:
      "Snapshot substituído pelo seed do repositório. Recarregue o dashboard; novas instâncias serverless já leem da base.",
  });
}
