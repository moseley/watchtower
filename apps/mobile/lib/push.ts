import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

// Show foreground notifications as a banner (SDK 57 handler shape).
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export type PushResult =
  | { ok: true; token: string }
  | { ok: false; reason: "denied" | "unsupported" | "error"; message?: string };

/**
 * Obtain this device's Expo push token.
 *
 * Declining notifications is a normal outcome, not an error: the app has to
 * stay usable either way, so a refusal comes back as a result rather than an
 * exception. Pass `request: false` on launch to read the existing permission
 * without triggering a prompt, and `true` only when the user asks for it.
 */
export async function getExpoPushToken({ request }: { request: boolean }): Promise<PushResult> {
  if (!Device.isDevice) {
    return { ok: false, reason: "unsupported", message: "Push needs a physical device." };
  }

  try {
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "Default",
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#2563EB",
      });
    }

    const { status: existing } = await Notifications.getPermissionsAsync();
    let status = existing;
    if (existing !== "granted") {
      if (!request) return { ok: false, reason: "denied" };
      status = (await Notifications.requestPermissionsAsync()).status;
    }
    if (status !== "granted") return { ok: false, reason: "denied" };

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      // easConfig is populated in EAS builds
      (Constants as unknown as { easConfig?: { projectId?: string } }).easConfig?.projectId;
    if (!projectId) {
      return { ok: false, reason: "error", message: "EAS projectId not found." };
    }

    const token = await Notifications.getExpoPushTokenAsync({ projectId });
    return { ok: true, token: token.data };
  } catch (err) {
    return { ok: false, reason: "error", message: (err as Error).message };
  }
}
