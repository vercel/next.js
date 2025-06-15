import { drupal } from "@/lib/drupal";
import { enableDraftMode } from "next-drupal/draft";
import type { NextRequest } from "next/server";

export async function GET(request: NextRequest): Promise<Response | never> {
  return enableDraftMode(request, drupal);
}
