import { revalidatePath as revalidatePathAlias } from "next/cache";

export async function GET() {
  revalidatePathAlias("next");
}
