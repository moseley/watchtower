import { type Prisma, prisma } from "@watchtower/db";
import { CreateWatchInputSchema } from "@watchtower/types";

export const dynamic = "force-dynamic";

// List an owner's watches. Phase 1 has no auth, so identity is the ownerId the
// client received at registration. Real auth arrives in Phase 2.
export async function GET(request: Request) {
  const ownerId = new URL(request.url).searchParams.get("ownerId");
  if (!ownerId) {
    return Response.json({ error: "ownerId query param required" }, { status: 400 });
  }
  const watches = await prisma.watch.findMany({
    where: { ownerId },
    orderBy: { createdAt: "desc" },
  });
  return Response.json({ watches });
}

// Create a watch for an owner.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | (Record<string, unknown> & { ownerId?: unknown })
    | null;

  const ownerId = body?.ownerId;
  if (typeof ownerId !== "string" || ownerId.length === 0) {
    return Response.json({ error: "ownerId required" }, { status: 400 });
  }

  const parsed = CreateWatchInputSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "invalid input", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const owner = await prisma.owner.findUnique({ where: { id: ownerId } });
  if (!owner) {
    return Response.json({ error: "owner not found" }, { status: 404 });
  }

  const { source, label, config } = parsed.data;
  const watch = await prisma.watch.create({
    data: {
      ownerId,
      source,
      label,
      config: config as unknown as Prisma.InputJsonValue,
    },
  });

  return Response.json({ watch }, { status: 201 });
}
