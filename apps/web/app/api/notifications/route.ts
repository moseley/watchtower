import { prisma } from "@watchtower/db";

export const dynamic = "force-dynamic";

const MAX_ROWS = 50;

// GET /api/notifications?ownerId=...
// Every alert the engine has sent this owner, newest first. Phase 1 trust
// model: the caller proves ownership with the ownerId it got at registration.
export async function GET(request: Request) {
  const ownerId = new URL(request.url).searchParams.get("ownerId");
  if (!ownerId) {
    return Response.json({ error: "ownerId query param required" }, { status: 400 });
  }

  const rows = await prisma.notification.findMany({
    where: { watch: { ownerId } },
    orderBy: { createdAt: "desc" },
    take: MAX_ROWS,
    select: {
      id: true,
      title: true,
      body: true,
      status: true,
      createdAt: true,
      payload: true,
      watch: { select: { source: true, label: true, config: true } },
    },
  });

  const notifications = rows.map((n) => ({
    id: n.id,
    title: n.title,
    body: n.body,
    status: n.status,
    createdAt: n.createdAt.toISOString(),
    source: n.watch.source,
    watchLabel: n.watch.label,
    payload: n.payload,
  }));

  return Response.json({ notifications });
}
