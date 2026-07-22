import { type Prisma, prisma } from "@watchtower/db";
import { DeviceRegistrationSchema } from "@watchtower/types";

export const dynamic = "force-dynamic";

// Register a push destination: a phone (Expo push token) or a browser
// (Web Push subscription). Brand-new devices get a fresh Owner (Phase 1
// identity — no login). Returns the ids the client stores locally.
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
    const { expoPushToken, platform } = parsed.data;
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
            owner: { create: {} },
          },
        });
    return Response.json({ ownerId: device.ownerId, deviceId: device.id });
  }

  const subscription = parsed.data.webPushSubscription;
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
          owner: { create: {} },
        },
      });
  return Response.json({ ownerId: device.ownerId, deviceId: device.id });
}
