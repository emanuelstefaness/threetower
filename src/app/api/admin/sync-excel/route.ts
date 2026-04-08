import { createHash, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { getBuildingStore } from "@/server/building/buildingStore";
import { generateBuildingFromSeed } from "@/server/building/generateBuilding";
import { persistSnapshotNow } from "@/server/building/loadPersisted";
import { isPersistenceEnabled } from "@/server/building/persistBuildingState";
import { parseTreeTowerXlsxBuffer } from "@/server/building/parseTreeTowerXlsx";

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
 * Importa planilha Excel (formato Tree Tower) e substitui o estado do prédio.
 * Autenticação: header `Authorization: Bearer <EXCEL_SYNC_SECRET>`.
 * Body: `multipart/form-data` com campo `file` (.xlsx).
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
      { error: "Persistência desativada (BUILDING_PERSISTENCE)" },
      { status: 503 }
    );
  }

  const ct = req.headers.get("content-type") || "";
  if (!ct.includes("multipart/form-data")) {
    return NextResponse.json({ error: "Use multipart/form-data com campo file" }, { status: 400 });
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: "Campo file (ficheiro .xlsx) em falta" }, { status: 400 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.length === 0) {
    return NextResponse.json({ error: "Ficheiro vazio" }, { status: 400 });
  }

  let seed;
  try {
    seed = parseTreeTowerXlsxBuffer(buf);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao ler Excel";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  if (seed.length === 0) {
    return NextResponse.json({ error: "Nenhuma sala válida na planilha" }, { status: 400 });
  }

  const snapshot = generateBuildingFromSeed(seed);
  const store = await getBuildingStore();
  store.replaceSnapshotFromImport(snapshot);
  await persistSnapshotNow(store.getState());

  return NextResponse.json({ ok: true, roomsImported: seed.length });
}
