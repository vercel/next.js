import { expirePath, expireTag } from "next/cache";

export async function GET() {
  expirePath("next");
  expireTag("next");
  expirePath("next");
  expireTag("next");
}
