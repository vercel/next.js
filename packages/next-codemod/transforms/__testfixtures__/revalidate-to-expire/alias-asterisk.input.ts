import * as cache from "next/cache";

export async function GET() {
  cache.revalidatePath("next");
  cache.revalidateTag("next");
  cache["revalidatePath"]("next");
  cache["revalidateTag"]("next");
}
