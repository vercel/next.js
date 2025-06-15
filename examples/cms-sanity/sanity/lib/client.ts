import { apiVersion, dataset, projectId, studioUrl } from "@/sanity/lib/api";
import { createClient } from "next-sanity";

export const client = createClient({
  projectId,
  dataset,
  apiVersion,
  useCdn: true,
  perspective: "published",
  stega: {
    studioUrl,
    logger:
      process.env.NEXT_PUBLIC_SANITY_STEGA_LOGGER === "false"
        ? undefined
        : console,
    filter: (props) => {
      if (props.sourcePath.at(-1) === "title") {
        return true;
      }

      return props.filterDefault(props);
    },
  },
});
