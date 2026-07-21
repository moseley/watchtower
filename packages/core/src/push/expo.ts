export interface PushMessage {
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export interface PushResult {
  ok: boolean;
  errors?: string[];
}

const EXPO_PUSH_ENDPOINT = "https://exp.host/--/api/v2/push/send";

function isExpoToken(token: string): boolean {
  return token.startsWith("ExponentPushToken[") || token.startsWith("ExpoPushToken[");
}

/**
 * Send a push to one or more Expo push tokens via Expo's push service.
 * No credentials required for basic sends. Returns ok=false if any message
 * was rejected by Expo.
 */
export async function sendExpoPush(
  tokens: string[],
  message: PushMessage,
  fetchImpl: typeof fetch = fetch,
): Promise<PushResult> {
  const valid = tokens.filter(isExpoToken);
  if (valid.length === 0) {
    return { ok: false, errors: ["no valid Expo push tokens"] };
  }

  const payload = valid.map((to) => ({
    to,
    sound: "default",
    title: message.title,
    body: message.body,
    data: message.data ?? {},
  }));

  const res = await fetchImpl(EXPO_PUSH_ENDPOINT, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    return { ok: false, errors: [`Expo push HTTP ${res.status}`] };
  }

  const json = (await res.json()) as {
    data?: Array<{ status: string; message?: string }>;
  };
  const errors = (json.data ?? [])
    .filter((ticket) => ticket.status !== "ok")
    .map((ticket) => ticket.message ?? "unknown push error");

  return errors.length > 0 ? { ok: false, errors } : { ok: true };
}
