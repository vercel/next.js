import { revalidatePath as revalidatePathAlias, revalidateTag as revalidateTagAlias, expirePath, expireTag } from "next/cache";

export async function GET() {
  revalidatePathAlias("next");
  revalidateTagAlias("next");
  expirePath("next");
  expireTag("next");
}
