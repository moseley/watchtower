import Constants from "expo-constants";

const extra = (Constants.expoConfig?.extra ?? {}) as { apiUrl?: string };

/**
 * Base URL of the Watchtower backend. Set in app.json -> expo.extra.apiUrl to
 * either the dev machine's LAN IP (e.g. http://192.168.1.50:3005) or the
 * deployed URL. Falls back to localhost (only reachable from an emulator).
 */
export const API_URL = extra.apiUrl ?? "http://localhost:3005";
