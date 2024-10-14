import { studioUrl as baseUrl, dataset, projectId } from "@/sanity/lib/api";
import { createDataAttribute } from "next-sanity";

export const dataAttribute = createDataAttribute({
  baseUrl,
  projectId,
  dataset,
});
