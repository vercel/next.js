import { Field } from "payload/types";
import { ArrayField } from "payload/dist/fields/config/types";
import deepMerge from "../utilities/deepMerge";
import link, { LinkAppearances } from "./link";

type LinkGroupType = (options?: {
  overrides?: Partial<ArrayField>;
  appearances?: LinkAppearances[] | false;
}) => Field;

const linkGroup: LinkGroupType = ({ overrides = {}, appearances } = {}) => {
  const generatedLinkGroup: Field = {
    name: "links",
    type: "array",
    fields: [
      link({
        appearances,
      }),
    ],
  };

  return deepMerge(generatedLinkGroup, overrides);
};

export default linkGroup;
