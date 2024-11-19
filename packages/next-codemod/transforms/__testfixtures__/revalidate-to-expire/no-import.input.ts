import { unstable_cacheTag as cacheTag } from "next/cache";

export async function GET() {
  cacheTag("next");
}
