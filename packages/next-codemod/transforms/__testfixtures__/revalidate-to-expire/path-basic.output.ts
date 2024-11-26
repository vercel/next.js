import { expirePath } from "next/cache";

export async function GET() {
  expirePath("next");
}
