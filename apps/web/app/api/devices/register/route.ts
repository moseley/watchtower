import { prisma } from "@watchtower/db";
import { DeviceRegistrationSchema } from "@watchtower/types";

export const dynamic = "force-dynamic";

// Register a phone by its Expo push token. Brand-new devices get a fresh Owner
// (Phase 1 identity — no login). Returns the ids the client stores locally.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = DeviceRegistrationSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "invalid input", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { expoPushToken, platform } = parsed.data;
  const existing = await prisma.device.findUnique({ where: { expoPushToken } });

  const device = existing
    ? await prisma.device.update({
        where: { expoPushToken },
        data: { lastSeenAt: new Date(), ...(platform ? { platform } : {}) },
      })
    : await prisma.device.create({
        data: {
          expoPushToken,
          ...(platform ? { platform } : {}),
          owner: { create: {} },
        },
      });

  return Response.json({ ownerId: device.ownerId, deviceId: device.id });
}
