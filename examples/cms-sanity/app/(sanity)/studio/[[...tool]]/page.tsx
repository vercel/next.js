import config from "@/sanity.config";
import { NextStudio } from "next-sanity/studio";

export const dynamic = "force-static";

export default function StudioPage() {
  return <NextStudio config={config} />;
}
