import { Field, SelectField } from "payload/types";
import deepMerge from "../utilities/deepMerge";

type Args = {
  overrides?: Partial<SelectField>;
};

export const backgroundColor = ({ overrides = {} }: Args): Field =>
  deepMerge(
    {
      name: "backgroundColor",
      type: "select",
      defaultValue: "white",
      options: [
        {
          label: "White",
          value: "white",
        },
        {
          label: "Black",
          value: "black",
        },
      ],
    },
    overrides,
  );
