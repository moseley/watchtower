import { HealthSchema } from "@watchtower/types";

export async function GET() {
  const body = HealthSchema.parse({ ok: true, service: "watchtower-web" });
  return Response.json(body);
}
