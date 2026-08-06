import { type Prisma, prisma } from "@watchtower/db";
import { CreateWatchInputSchema } from "@watchtower/types";
import { ConfigLookupError, buildStoredConfig } from "../../../../lib/watch-config";

export const dynamic = "force-dynamic";

/** Phase 1 trust model: the caller proves ownership with its stored ownerId. */
async function findOwned(id: string, ownerId: string | null) {
  if (!ownerId) return { error: "ownerId query param required", status: 400 as const };
  const watch = await prisma.watch.findUnique({ where: { id } });
  if (!watch || watch.ownerId !== ownerId) {
    return { error: "watch not found", status: 404 as const };
  }
  return { watch };
}

// Update one of the owner's watches.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const ownerId = new URL(request.url).searchParams.get("ownerId");

  const found = await findOwned(id, ownerId);
  if ("error" in found) {
    return Response.json({ error: found.error }, { status: found.status });
  }
  const { watch } = found;

  const body = await request.json().catch(() => null);
  const parsed = CreateWatchInputSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "invalid input", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { source, label, config } = parsed.data;

  // Switching a weather watch into a music one is really a different watch,
  // and its history would no longer describe it.
  if (source !== watch.source) {
    return Response.json(
      { error: "A watch's source can't be changed. Delete it and make a new one." },
      { status: 409 },
    );
  }

  // One watch per artist or person, excluding this one.
  const duplicatePath =
    source === "music"
      ? { path: ["artist", "mbid"], value: config.artist.mbid, name: config.artist.name }
      : source === "screen"
        ? { path: ["person", "tmdbId"], value: config.person.tmdbId, name: config.person.name }
        : null;

  if (duplicatePath) {
    const duplicate = await prisma.watch.findFirst({
      where: {
        ownerId: watch.ownerId,
        source,
        id: { not: id },
        config: { path: duplicatePath.path, equals: duplicatePath.value },
      },
    });
    if (duplicate) {
      return Response.json(
        { error: `You're already watching ${duplicatePath.name}.` },
        { status: 409 },
      );
    }
  }

  let storedConfig: unknown;
  try {
    storedConfig = await buildStoredConfig(parsed.data, watch.config as Record<string, unknown>);
  } catch (err) {
    if (err instanceof ConfigLookupError) {
      return Response.json({ error: err.message }, { status: 502 });
    }
    throw err;
  }

  const updated = await prisma.watch.update({
    where: { id },
    data: { label, config: storedConfig as Prisma.InputJsonValue },
  });

  return Response.json({ watch: updated });
}

// Delete one of the owner's watches.
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const ownerId = new URL(request.url).searchParams.get("ownerId");

  const found = await findOwned(id, ownerId);
  if ("error" in found) {
    return Response.json({ error: found.error }, { status: found.status });
  }

  await prisma.watch.delete({ where: { id } });
  return Response.json({ ok: true });
}
