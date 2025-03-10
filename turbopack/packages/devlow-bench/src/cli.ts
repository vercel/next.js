import minimist from "minimist";
import { setCurrentScenarios } from "./describe.js";
import { join } from "path";
import { Scenario, ScenarioVariant, runScenarios } from "./index.js";
import compose from "./interfaces/compose.js";
import { pathToFileURL } from "url";

(async () => {
  const knownArgs = new Set([
    "scenario",
    "s",
    "json",
    "j",
    "console",
    "datadog",
    "snowflake",
    "interactive",
    "i",
    "help",
    "h",
    "?",
    "_",
  ]);
  const args = minimist(process.argv.slice(2), {
    alias: {
      s: "scenario",
      j: "json",
      i: "interactive",
      "?": "help",
      h: "help",
    },
  });

  if (args.help || (Object.keys(args).length === 1 && args._.length === 0)) {
    console.log("Usage: devlow-bench [options] <scenario files>");
    console.log("## Selecting scenarios");
    console.log(
      "  --scenario=<filter>, -s=<filter>   Only run the scenario with the given name"
    );
    console.log(
      "  --interactive, -i                  Select scenarios and variants interactively"
    );
    console.log(
      "  --<prop>=<value>                   Filter by any variant property defined in scenarios"
    );
    console.log("## Output");
    console.log(
      "  --json=<path>, -j=<path>           Write the results to the given path as JSON"
    );
    console.log(
      "  --console                          Print the results to the console"
    );
    console.log(
      "  --datadog[=<hostname>]             Upload the results to Datadog"
    );
    console.log(
      "                                     (requires DATADOG_API_KEY environment variables)"
    );
    console.log(
      "  --snowflake[=<batch-uri>]          Upload the results to Snowflake"
    );
    console.log(
      "                                     (requires SNOWFLAKE_TOPIC_NAME and SNOWFLAKE_SCHEMA_ID and environment variables)"
    );
    console.log("## Help");
    console.log("  --help, -h, -?                     Show this help");
  }

  const scenarios: Scenario[] = [];
  setCurrentScenarios(scenarios);

  for (const path of args._) {
    await import(pathToFileURL(join(process.cwd(), path)).toString());
  }

  setCurrentScenarios(null);

  const cliIface = {
    filterScenarios: async (scenarios: Scenario[]) => {
      if (args.scenario) {
        const filter = [].concat(args.scenario);
        return scenarios.filter((s) =>
          filter.some((filter) => s.name.includes(filter))
        );
      }
      return scenarios;
    },
    filterScenarioVariants: async (variants: ScenarioVariant[]) => {
      const propEntries = Object.entries(args).filter(
        ([key]) => !knownArgs.has(key)
      );
      if (propEntries.length === 0) return variants;
      for (const [key, value] of propEntries) {
        const values = (Array.isArray(value) ? value : [value]).map((v) =>
          v.toString()
        );
        variants = variants.filter((variant) => {
          const prop = variant.props[key];
          if (typeof prop === "undefined") return false;
          const str = prop.toString();
          return values.some((v) => str.includes(v));
        });
      }
      return variants;
    },
  };
  let ifaces = [
    cliIface,
    args.interactive && (await import("./interfaces/interactive.js")).default(),
    args.json && (await import("./interfaces/json.js")).default(args.json),
    args.datadog &&
      (await import("./interfaces/datadog.js")).default(
        typeof args.datadog === "string" ? { host: args.datadog } : undefined
      ),
    args.snowflake &&
      (await import("./interfaces/snowflake.js")).default(
        typeof args.snowflake === "string" ? { gatewayUri: args.snowflake } : undefined
      ),
    args.console !== false &&
      (await import("./interfaces/console.js")).default(),
  ].filter((x) => x);
  await runScenarios(scenarios, compose(...ifaces));
})().catch((e) => {
  console.error(e.stack);
  process.exit(1);
});
