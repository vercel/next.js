import { Block } from "payload/types";
import { backgroundColor } from "../../fields/backgroundColor";
import linkGroup from "../../fields/linkGroup";
import richText from "../../fields/richText";

export const CallToAction: Block = {
  slug: "cta",
  labels: {
    singular: "Call to Action",
    plural: "Calls to Action",
  },
  fields: [
    backgroundColor({ overrides: { name: "ctaBackgroundColor" } }),
    richText(),
    linkGroup({
      appearances: ["primary", "secondary"],
      overrides: {
        maxRows: 2,
      },
    }),
  ],
};
