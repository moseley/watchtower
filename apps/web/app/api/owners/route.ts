import { prisma } from "@watchtower/db";

export const dynamic = "force-dynamic";

// Creates a bare identity with no push destination attached.
//
// Notifications are the point of Watchtower, but they must not be a condition
// of using it: someone who declines the permission prompt still needs to be
// able to look around and set watches up, then enable notifications later.
export async function POST() {
  const owner = await prisma.owner.create({ data: {} });
  return Response.json({ ownerId: owner.id }, { status: 201 });
}
