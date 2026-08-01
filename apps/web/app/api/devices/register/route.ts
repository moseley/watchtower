import { type Prisma, prisma } from "@watchtower/db";
import { DeviceRegistrationSchema } from "@watchtower/types";

export const dynamic = "force-dynamic";

/**
 * Decide which owner a brand-new device belongs to. If the client already has
 * an identity it keeps it, so enabling notifications after using the app for a
 * while doesn't strand the watches that were already created.
 */
async function ownerConnection(ownerId: string | undefined) {
  if (ownerId) {
    const existing = await prisma.owner.findUnique({ where: { id: ownerId } });
    if (existing) return { connect: { id: existing.id } };
  }
  return { create: {} };
}

// Register a push destination: a phone (Expo push token) or a browser
// (Web Push subscription). Returns the ids the client stores locally.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = DeviceRegistrationSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "invalid input", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  if ("expoPushToken" in parsed.data) {
    const { expoPushToken, platform, ownerId } = parsed.data;
    const existing = await prisma.device.findUnique({ where: { expoPushToken } });
    const device = existing
      ? await prisma.device.update({
          where: { expoPushToken },
          data: { lastSeenAt: new Date(), ...(platform ? { platform } : {}) },
        })
      : await prisma.device.create({
          data: {
            kind: "expo",
            expoPushToken,
            ...(platform ? { platform } : {}),
            owner: await ownerConnection(ownerId),
          },
        });
    return Response.json({ ownerId: device.ownerId, deviceId: device.id });
  }

  const { webPushSubscription: subscription, ownerId } = parsed.data;
  const subscriptionJson = subscription as unknown as Prisma.InputJsonValue;
  const existing = await prisma.device.findUnique({
    where: { webPushEndpoint: subscription.endpoint },
  });
  const device = existing
    ? await prisma.device.update({
        where: { webPushEndpoint: subscription.endpoint },
        data: { lastSeenAt: new Date(), webPushSubscription: subscriptionJson },
      })
    : await prisma.device.create({
        data: {
          kind: "webpush",
          webPushEndpoint: subscription.endpoint,
          webPushSubscription: subscriptionJson,
          platform: "web",
          owner: await ownerConnection(ownerId),
        },
      });
  return Response.json({ ownerId: device.ownerId, deviceId: device.id });
}
