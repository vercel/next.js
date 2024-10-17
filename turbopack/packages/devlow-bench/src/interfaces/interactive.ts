import { Interface } from "../index.js";
import inquirer from "inquirer";
import { formatVariant } from "../utils.js";

export default function createInterface(): Interface {
  const iface: Interface = {
    filterScenarios: async (scenarios) => {
      if (scenarios.length === 1) {
        return scenarios;
      }
      let answer = await inquirer.prompt({
        type: "checkbox",
        name: "scenarios",
        default: scenarios.slice(),
        message: "Choose scenarios to run",
        choices: scenarios.map((scenario) => ({
          name: scenario.name,
          value: scenario,
        })),
      });
      return answer.scenarios;
    },
    filterScenarioVariants: async (variants) => {
      if (variants.length === 1) {
        return variants;
      }
      let answer = await inquirer.prompt({
        type: "checkbox",
        name: "variants",
        default: variants.slice(),
        message: "Choose variants to run",
        choices: variants.map((variant) => {
          return {
            name: formatVariant(variant.scenario.name, variant.props),
            value: variant,
          };
        }),
      });
      return answer.variants;
    },
  };

  return iface;
}
