"use server";

import { updateTag } from "next/cache";

export default async function revalidate() {
  updateTag("time-data");
}
