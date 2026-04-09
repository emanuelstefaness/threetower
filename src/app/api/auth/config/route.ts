import { NextResponse } from "next/server";
import { hasNamedUsers } from "@/server/auth/appUsers";

export const dynamic = "force-dynamic";

/** Indica se o formulário deve pedir utilizador + palavra-passe. */
export async function GET() {
  return NextResponse.json({ namedUsers: hasNamedUsers() });
}
