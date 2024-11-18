import { Interface } from "../index.js";
import { formatUnit } from "../units.js";
import { writeFile } from "fs/promises";

function filterProp(
  prop: Record<string, string | number | boolean | null>
): Record<string, string | number | boolean> {
  const filteredProp: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(prop)) {
    if (value !== null) {
      filteredProp[key] = value;
    }
  }
  return filteredProp;
}

export default function createInterface(
  file: string = (() => {
    const file = process.env.JSON_OUTPUT_FILE;
    if (!file) {
      throw new Error("env var JSON_OUTPUT_FILE is not set");
    }
    return file;
  })()
): Interface {
  const metrics = new Map<
    string,
    {
      key: Record<string, string | number>;
      value: number;
      unit: string;
      count: number;
      relativeTo?: string;
    }
  >();
  const iface: Interface = {
    measurement: async (scenario, props, name, value, unit, relativeTo) => {
      const keyObject = {
        scenario: scenario,
        ...filterProp(props),
        name: name,
      };
      const key = JSON.stringify(keyObject);
      const current = metrics.get(key);
      if (current) {
        current.value += value;
        current.count++;
      } else {
        metrics.set(key, {
          key: keyObject,
          value,
          unit: unit,
          count: 1,
          relativeTo,
        });
      }
    },
    finish: async () => {
      await writeFile(
        file,
        JSON.stringify(
          [...metrics.values()].map(
            ({ key, value, unit, count, relativeTo }) => {
              return {
                key,
                value: value / count,
                unit,
                text: formatUnit(value / count, unit),
                datapoints: count,
                relativeTo,
              };
            }
          )
        )
      );
    },
  };

  return iface;
}
