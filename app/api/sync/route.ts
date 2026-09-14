import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../../chatgpt-auth";

export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "no-store" };

async function currentUser() {
  const authenticated = await getChatGPTUser();
  if (authenticated) return authenticated;
  if (process.env.NODE_ENV === "development") {
    return {
      userId: "local-quality-assurance",
      displayName: "Iago Freitas",
      email: "iago@iago-security.local",
      fullName: "Iago Freitas",
    };
  }
  return null;
}

export async function GET() {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Não autenticado" }, { status: 401, headers });
  const db = env.DB;
  if (!db) return Response.json({ error: "Armazenamento indisponível" }, { status: 503, headers });
  try {
    const row = await db.prepare(
      "SELECT data, revision, updated_at AS updatedAt FROM workspace_state WHERE owner_id = ?",
    )
      .bind(user.userId)
      .first<{ data: string; revision: number; updatedAt: string }>();
    if (!row) return Response.json({ state: null, revision: 0 }, { headers });
    return Response.json(
      { state: JSON.parse(row.data), revision: row.revision, updatedAt: row.updatedAt },
      { headers },
    );
  } catch (error) {
    console.error("Iago Security sync read failed", error);
    return Response.json({ error: "O cofre online está temporariamente indisponível." }, { status: 503, headers });
  }
}

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Não autenticado" }, { status: 401, headers });
  const db = env.DB;
  if (!db) return Response.json({ error: "Armazenamento indisponível" }, { status: 503, headers });
  try {
    const body = (await request.json()) as { state?: unknown; expectedRevision?: number };
    if (!body.state || typeof body.state !== "object" || !Number.isInteger(body.expectedRevision)) {
      return Response.json({ error: "Payload de sincronização inválido." }, { status: 400, headers });
    }
    const expectedRevision = body.expectedRevision as number;
    const serialized = JSON.stringify(body.state);
    if (serialized.length > 1_500_000) {
      return Response.json({ error: "O cofre excedeu o limite de sincronização." }, { status: 413, headers });
    }
    const now = new Date().toISOString();
    if (expectedRevision === 0) {
      const inserted = await db.prepare(
        "INSERT OR IGNORE INTO workspace_state (id, owner_id, data, revision, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)",
      )
        .bind(crypto.randomUUID(), user.userId, serialized, now, now)
        .run();
      if (inserted.meta.changes === 1) {
        return Response.json({ revision: 1, updatedAt: now }, { headers });
      }
    } else {
      const updated = await db.prepare(
        "UPDATE workspace_state SET data = ?, revision = revision + 1, updated_at = ? WHERE owner_id = ? AND revision = ?",
      )
        .bind(serialized, now, user.userId, expectedRevision)
        .run();
      if (updated.meta.changes === 1) {
        return Response.json({ revision: expectedRevision + 1, updatedAt: now }, { headers });
      }
    }
    const current = await db.prepare(
      "SELECT data, revision, updated_at AS updatedAt FROM workspace_state WHERE owner_id = ?",
    )
      .bind(user.userId)
      .first<{ data: string; revision: number; updatedAt: string }>();
    return Response.json(
      {
        conflict: true,
        state: current ? JSON.parse(current.data) : null,
        revision: current?.revision ?? 0,
        updatedAt: current?.updatedAt ?? null,
      },
      { status: 409, headers },
    );
  } catch (error) {
    console.error("Iago Security sync write failed", error);
    return Response.json({ error: "Não foi possível sincronizar agora." }, { status: 503, headers });
  }
}
