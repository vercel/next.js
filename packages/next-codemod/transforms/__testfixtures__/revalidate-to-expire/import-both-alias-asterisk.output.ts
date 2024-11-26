import * as cache from "next/cache";

export async function GET() {
  cache.expirePath("next");
  cache.expireTag("next");
  cache.expirePath("next");
  cache.expireTag("next");
}
