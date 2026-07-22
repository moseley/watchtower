export const dynamic = "force-dynamic";

// The VAPID public key is, as the name says, public — browsers need it to
// create a push subscription bound to our server.
export async function GET() {
  return Response.json({ vapidPublicKey: process.env.VAPID_PUBLIC_KEY ?? null });
}
