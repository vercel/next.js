import { expireTag } from "next/cache";

export async function GET() {
  expireTag("next");
}
