import "server-only";

import { createServerSideClient as createServerSideClient_ } from "@nhost/nextjs/server";
import nhostConfig from "./nhost-config";

export async function createServerSideClient(searchParams) {
  return createServerSideClient_(nhostConfig, searchParams);
}
