import { revalidatePath as revalidatePathAlias, revalidateTag as revalidateTagAlias, expirePath as expirePathAlias, expireTag as expireTagAlias } from "next/cache";

export async function GET() {
  revalidatePathAlias("next");
  revalidateTagAlias("next");
  expirePathAlias("next");
  expireTagAlias("next");
}
