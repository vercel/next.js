import { Interface } from "../index.js";
import { bgCyan, bold, magenta, red, underline } from "picocolors";
import { formatUnit } from "../units.js";
import { formatVariant } from "../utils.js";

export default function createInterface(): Interface {
  const iface: Interface = {
    start: async (scenario, props) => {
      console.log(
        bold(underline(`Running ${formatVariant(scenario, props)}...`))
      );
    },
    measurement: async (scenario, props, name, value, unit, relativeTo) => {
      console.log(
        bgCyan(
          bold(
            magenta(
              `${formatVariant(scenario, props)}: ${name} = ${formatUnit(
                value,
                unit
              )}${relativeTo ? ` (from ${relativeTo})` : ""}`
            )
          )
        )
      );
    },
    error: async (scenario, props, error) => {
      console.log(
        bold(
          red(
            `${formatVariant(scenario, props)}: ${
              (error && (error as any).stack) || error
            }`
          )
        )
      );
    },
  };

  return iface;
}
