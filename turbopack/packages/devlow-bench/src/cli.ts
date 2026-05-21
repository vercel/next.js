import minimist from 'minimist'
import { setCurrentScenarios } from './describe.js'
import { join } from 'path'
import { Scenario, ScenarioVariant, runScenarios } from './index.js'
import compose from './interfaces/compose.js'
import { groupRows, printComparison } from './compare.js'
import { readSnapshot, resolveCompareTarget } from './snapshot.js'
import { pathToFileURL } from 'url'

const SUBCOMMANDS = new Set(['run', 'compare'])

;(async () => {
  // Subcommand dispatch. `devlow-bench run [opts] scenario.mjs` and
  // `devlow-bench compare <a.csv> <b.csv>` are the explicit forms. A bare
  // `devlow-bench <script>` falls through to legacy run-mode for back-compat.
  const argv = process.argv.slice(2)
  const first = argv[0]
  const sub = first && SUBCOMMANDS.has(first) ? first : 'run'
  const rest = first && SUBCOMMANDS.has(first) ? argv.slice(1) : argv

  if (sub === 'compare') {
    await runCompareSubcommand(rest)
    return
  }
  await runRunSubcommand(rest)
})().catch((e) => {
  console.error(e.stack)
  process.exit(1)
})

async function runCompareSubcommand(argv: string[]): Promise<void> {
  const args = minimist(argv, {
    alias: { '?': 'help', h: 'help' },
  })
  if (args.help || args._.length === 0) {
    console.log(`Usage: devlow-bench compare <baseline.csv> <current.csv>
  Reads both snapshot CSVs and prints a side-by-side comparison table
  with p50/p90/p99 plus a Mann–Whitney U p-value per metric.`)
    if (args.help) return
  }
  if (args._.length !== 2) {
    console.error(
      `devlow-bench compare: expected 2 positional CSV paths, got ${args._.length}.`
    )
    console.error('Usage: devlow-bench compare <baseline.csv> <current.csv>')
    process.exit(1)
  }
  const [baselinePath, currentPath] = args._
  const [baseRows, curRows] = await Promise.all([
    readSnapshot(baselinePath),
    readSnapshot(currentPath),
  ])
  printComparison(groupRows(baseRows), groupRows(curRows), {
    baselineLabel: baselinePath,
    currentLabel: currentPath,
  })
}

async function runRunSubcommand(argv: string[]): Promise<void> {
  const knownArgs = new Set([
    'scenario',
    's',
    'json',
    'j',
    'console',
    'datadog',
    'snowflake',
    'interactive',
    'i',
    'n',
    'warmup',
    'snapshot',
    'compare',
    'baseline',
    'help',
    'h',
    '?',
    '_',
  ])
  const args = minimist(argv, {
    alias: {
      s: 'scenario',
      j: 'json',
      i: 'interactive',
      '?': 'help',
      h: 'help',
    },
    // `compare` is strictly a boolean toggle now (use --baseline=<path> for
    // the value form). Declaring it here prevents `--compare scenario.mjs`
    // from consuming the scenario as the flag value.
    boolean: ['compare'],
  })

  if (args.help || (Object.keys(args).length === 1 && args._.length === 0)) {
    console.log(`Usage: devlow-bench [run] [options] <scenario files>
       devlow-bench compare <baseline.csv> <current.csv>
## Selecting scenarios
  --scenario=<filter>, -s=<filter>   Only run the scenario with the given name
  --interactive, -i                  Select scenarios and variants interactively
  --<prop>=<value>                   Filter by any variant property defined in scenarios
## Repeated sampling
  --n=<number>                       Run each variant N times. Reports mean/p50/p90 per metric.
                                     Default: 1.
  --warmup=<number>                  Discard the first N runs of each variant before sampling.
                                     Default: 0. Do NOT enable when measuring cold-start metrics.
## Snapshots & comparison
  --snapshot=<path>                  Override the snapshot CSV path.
                                     Default: ./.devlow-bench/snapshots/<ts>.csv. Snapshots are always written.
  --compare                          Print a comparison table at end of run. Baseline = newest snapshot,
                                     unless --baseline overrides.
  --baseline=<path>                  Explicit baseline (file or directory). Implies --compare.
## Output
  --json=<path>, -j=<path>           Write the results to the given path as JSON
  --console                          Print the results to the console
  --datadog[=<hostname>]             Upload the results to Datadog
                                     (requires DATADOG_API_KEY environment variables)
  --snowflake[=<batch-uri>]          Upload the results to Snowflake
                                     (requires SNOWFLAKE_TOPIC_NAME and SNOWFLAKE_SCHEMA_ID and environment variables)
## Help
  --help, -h, -?                     Show this help`)
    if (args.help) return
  }

  const scenarios: Scenario[] = []
  setCurrentScenarios(scenarios)

  for (const path of args._) {
    await import(pathToFileURL(join(process.cwd(), path)).toString())
  }

  setCurrentScenarios(null)

  const cliIface = {
    filterScenarios: async (scenarios: Scenario[]) => {
      if (args.scenario) {
        const filter = [].concat(args.scenario)
        return scenarios.filter((s) =>
          filter.some((filter) => s.name.includes(filter))
        )
      }
      return scenarios
    },
    filterScenarioVariants: async (variants: ScenarioVariant[]) => {
      const propEntries = Object.entries(args).filter(
        ([key]) => !knownArgs.has(key)
      )
      if (propEntries.length === 0) return variants
      for (const [key, value] of propEntries) {
        const values = (Array.isArray(value) ? value : [value]).map((v) =>
          v.toString()
        )
        variants = variants.filter((variant) => {
          const prop = variant.props[key]
          if (typeof prop === 'undefined') return false
          const str = prop.toString()
          return values.some((v) => str.includes(v))
        })
      }
      return variants
    },
  }
  // Validation (clamp to non-negative integers, default n=1/warmup=0) is
  // delegated to runScenarios — see runner.ts.
  const n = typeof args.n === 'number' ? args.n : 1
  const warmup = typeof args.warmup === 'number' ? args.warmup : 0

  // Snapshot is always on. `--snapshot=<path>` overrides the default path.
  const snapshotPath =
    typeof args.snapshot === 'string' ? args.snapshot : undefined
  const snapshotIface = (await import('./interfaces/snapshot.js')).default({
    path: snapshotPath,
  })

  // Comparison: enabled by either --compare (boolean) or --baseline=<path>.
  // The baseline is the value of --baseline if given, else "auto" (newest
  // snapshot in the default snapshot dir).
  const compareEnabled =
    args.compare === true || typeof args.baseline === 'string'
  let compareIface: any = null
  if (compareEnabled) {
    const baselineArg = typeof args.baseline === 'string' ? args.baseline : true
    const baselinePath = await resolveCompareTarget(
      baselineArg,
      snapshotIface.resolvedPath
    )
    if (baselinePath == null) {
      console.error(
        'No baseline snapshot found. Run devlow-bench at least once, or pass --baseline=<path>.'
      )
      process.exit(1)
    }
    compareIface = await (
      await import('./interfaces/compare.js')
    ).default({ baselinePath })
  }

  let ifaces = [
    cliIface,
    args.interactive && (await import('./interfaces/interactive.js')).default(),
    args.json &&
      (await import('./interfaces/json.js')).default(args.json, { n }),
    args.datadog &&
      (await import('./interfaces/datadog.js')).default(
        typeof args.datadog === 'string' ? { host: args.datadog } : undefined
      ),
    args.snowflake &&
      (await import('./interfaces/snowflake.js')).default(
        typeof args.snowflake === 'string'
          ? { gatewayUri: args.snowflake }
          : undefined
      ),
    args.console !== false &&
      (await import('./interfaces/console.js')).default({ n }),
    compareIface,
    snapshotIface,
  ].filter((x) => x)
  await runScenarios(scenarios, compose(...ifaces), { n, warmup })
}
