import { prisma } from "@watchtower/db";

export const dynamic = "force-dynamic";

// Delete one of the owner's watches. Phase 1 trust model: the caller proves
// ownership by supplying the ownerId it received at registration.
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const ownerId = new URL(request.url).searchParams.get("ownerId");
  if (!ownerId) {
    return Response.json({ error: "ownerId query param required" }, { status: 400 });
  }

  const watch = await prisma.watch.findUnique({ where: { id } });
  if (!watch || watch.ownerId !== ownerId) {
    return Response.json({ error: "watch not found" }, { status: 404 });
  }

  await prisma.watch.delete({ where: { id } });
  return Response.json({ ok: true });
}
