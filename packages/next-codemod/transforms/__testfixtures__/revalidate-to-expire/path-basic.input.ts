import { revalidatePath } from "next/cache";

export async function GET() {
  revalidatePath("next");
}