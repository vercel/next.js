import { revalidatePath, revalidateTag, expirePath, expireTag } from "next/cache";

export async function GET() {
  revalidatePath("next");
  revalidateTag("next");
  expirePath("next");
  expireTag("next");
}
