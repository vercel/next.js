import Statsig, { LogEventObject, StatsigUser } from "statsig-node";
import { cookies } from "next/headers";

export const STABLE_ID_COOKIE_NAME = "custom-statsig-stable-id";

const SERVER_KEY = process.env.STATSIG_SERVER_KEY!;
const CLIENT_KEY = process.env.STATSIG_CLIENT_KEY!;

const isStatsigReady = Statsig.initialize(SERVER_KEY);

export function getStableId() {
  return cookies().get(STABLE_ID_COOKIE_NAME)?.value;
}

export async function getStatsigValues(
  user: StatsigUser,
): Promise<{ values: string; clientKey: string }> {
  await isStatsigReady;

  const values = Statsig.getClientInitializeResponse(user, CLIENT_KEY, {
    hash: "djb2", // 🔥 IMPORTANT - Must be djb2, by default this method uses sha256
  });

  return {
    values: JSON.stringify(values),
    clientKey: CLIENT_KEY,
  };
}

export async function logEvents(events: LogEventObject[]): Promise<void> {
  await isStatsigReady;

  events.forEach((event) => Statsig.logEventObject(event));
}
