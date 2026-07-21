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

/**
 * Request permission and return this device's Expo push token.
 * Requires a physical device and a development/standalone build (Expo Go can no
 * longer obtain remote push tokens as of SDK 53+).
 */
export async function registerForPushNotificationsAsync(): Promise<string> {
  if (!Device.isDevice) {
    throw new Error("Push notifications require a physical device.");
  }

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
    status = (await Notifications.requestPermissionsAsync()).status;
  }
  if (status !== "granted") {
    throw new Error("Notification permission was not granted.");
  }

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    // easConfig is populated in EAS builds
    (Constants as unknown as { easConfig?: { projectId?: string } }).easConfig?.projectId;
  if (!projectId) {
    throw new Error("EAS projectId not found — run `eas init` first.");
  }

  const token = await Notifications.getExpoPushTokenAsync({ projectId });
  return token.data;
}
