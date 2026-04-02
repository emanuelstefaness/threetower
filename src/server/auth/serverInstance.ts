import { randomBytes } from "crypto";

type G = typeof globalThis & { __towerServerInstanceId?: string };

/** ID único por arranque do processo Node (muda a cada `npm run dev`). */
export function getServerInstanceId(): string {
  const g = globalThis as G;
  if (!g.__towerServerInstanceId) {
    g.__towerServerInstanceId = randomBytes(16).toString("hex");
  }
  return g.__towerServerInstanceId;
}
