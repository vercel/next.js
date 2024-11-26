import { revalidatePath, revalidateTag, expirePath as expirePathAlias, expireTag as expireTagAlias } from "next/cache";

export async function GET() {
  revalidatePath("next");
  revalidateTag("next");
  expirePathAlias("next");
  expireTagAlias("next");
}
