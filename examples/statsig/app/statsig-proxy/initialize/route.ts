import { StatsigUser } from "statsig-node";

import { getStatsigValues } from "@/lib/statsig-helpers";

export async function POST(request: Request): Promise<Response> {
  const json = await request.json();

  if (!json || typeof json !== "object") {
    return new Response(null, { status: 400 });
  }

  const body = json as { user: StatsigUser };

  const { values } = await getStatsigValues(body.user);
  return new Response(values);
}
