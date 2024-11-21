import { revalidateTag as revalidateTagAlias } from "next/cache";

export async function GET() {
  revalidateTagAlias("next");
}
