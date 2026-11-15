import { Command } from 'commander'
import { join } from 'path'
import { pathToFileURL } from 'url'
import { groupRows, printComparison } from './compare.js'
import { setCurrentScenarios } from './describe.js'
import { type Scenario, type ScenarioVariant, runScenarios } from './index.js'
import compose from './interfaces/compose.js'
import { readSnapshot, resolveCompareTarget } from './snapshot.js'

interface RunOptions {
  scenario?: string[]
  filter?: string[]
  interactive?: boolean
  n?: number
  warmup?: number
  // Path override for the always-on snapshot CSV.
  // undefined means the default path of .devlow-bench/snapshots/<ts>.csv
  snapshot?: string
  compare?: boolean
  baseline?: string
  json?: string
  console?: boolean
  datadog?: string | boolean
  snowflake?: string | boolean
}

;(async () => {
  const program = new Command()
    .name('devlow-bench')
    .description('Run developer-workflow benchmarks.')
    .showHelpAfterError()

  program
    .command('run', { isDefault: true })
    .description('Run scenario files and report measurements.')
    .argument('[scenarios...]', 'Scenario module paths to load.')
    .option(
      '-s, --scenario <filter>',
      'Only run scenarios whose name matches the filter (repeatable).',
      (v: string, prev: string[] | undefined) => (prev ?? []).concat(v),
      []
    )
    .option(
      '-F, --filter <pair>',
      'Filter variants by property: -F key=value (repeatable; same key repeated = OR).',
      (v: string, prev: string[] | undefined) => (prev ?? []).concat(v),
      []
    )
    .option('-i, --interactive', 'Select scenarios and variants interactively.')
    .option(
      '--n <number>',
      'Run each variant N times; reports mean/p50/p90 per metric. Default: 1.',
      (v: string) => Number(v)
    )
    .option(
      '--warmup <number>',
      'Discard the first N runs of each variant before sampling. Default: 0. Do NOT enable when measuring cold-start metrics.',
      (v: string) => Number(v)
    )
    .option(
      '--snapshot <path>',
      'Override the snapshot CSV path. Default: ./.devlow-bench/snapshots/<ts>.csv. Snapshots are always written.'
    )
    .option(
      '--compare',
      'Print a comparison table at end of run. Baseline = newest snapshot, unless --baseline overrides.'
    )
    .option(
      '--baseline <path>',
      'Explicit baseline (file or directory). Implies --compare.'
    )
    .option('-j, --json <path>', 'Write the results to the given path as JSON.')
    .option('--no-console', 'Suppress console output.')
    .option(
      '--datadog [host]',
      'Upload the results to Datadog (requires DATADOG_API_KEY).'
    )
    .option(
      '--snowflake [batchUri]',
      'Upload the results to Snowflake (requires SNOWFLAKE_TOPIC_NAME and SNOWFLAKE_SCHEMA_ID).'
    )
    .action(runRun)

  program
    .command('compare')
    .description(
      'Compare two snapshot CSVs side-by-side, with p50/p90/p99 plus a Mann–Whitney U p-value per metric.'
    )
    .argument('<baseline>', 'Baseline snapshot CSV path.')
    .argument('<current>', 'Current snapshot CSV path.')
    .action(runCompare)

  await program.parseAsync()
})().catch((e) => {
  console.error(e.stack)
  process.exit(1)
})

async function runCompare(
  baselinePath: string,
  currentPath: string
): Promise<void> {
  const [baseRows, curRows] = await Promise.all([
    readSnapshot(baselinePath),
    readSnapshot(currentPath),
  ])
  printComparison(groupRows(baseRows), groupRows(curRows), {
    baselineLabel: baselinePath,
    currentLabel: currentPath,
  })
}

async function runRun(
  scenarioPaths: string[],
  opts: RunOptions
): Promise<void> {
  const propFilters: [string, string][] = []
  for (const pair of opts.filter ?? []) {
    const eq = pair.indexOf('=')
    if (eq === -1) {
      console.error(`devlow-bench: invalid -F ${pair} (expected key=value).`)
      process.exit(1)
    }
    propFilters.push([pair.slice(0, eq), pair.slice(eq + 1)])
  }

  const scenarios: Scenario[] = []
  setCurrentScenarios(scenarios)
  for (const path of scenarioPaths) {
    await import(pathToFileURL(join(process.cwd(), path)).toString())
  }
  setCurrentScenarios(null)

  const cliIface = {
    filterScenarios: async (allScenarios: Scenario[]) => {
      const filters = opts.scenario
      if (!filters || filters.length === 0) return allScenarios
      return allScenarios.filter((s) => filters.some((f) => s.name.includes(f)))
    },
    filterScenarioVariants: async (variants: ScenarioVariant[]) => {
      if (propFilters.length === 0) return variants
      // Group multiple -F key=value with the same key into an OR set.
      const byKey = new Map<string, string[]>()
      for (const [k, v] of propFilters) {
        const existing = byKey.get(k)
        if (existing) existing.push(v)
        else byKey.set(k, [v])
      }
      for (const [key, values] of byKey) {
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
  const n = typeof opts.n === 'number' && Number.isFinite(opts.n) ? opts.n : 1
  const warmup =
    typeof opts.warmup === 'number' && Number.isFinite(opts.warmup)
      ? opts.warmup
      : 0

  // Snapshot is always on. --snapshot=<path> overrides the default path.
  const snapshotIface = (await import('./interfaces/snapshot.js')).default({
    path: opts.snapshot,
  })

  // Comparison: enabled by --compare or by giving an explicit --baseline.
  const compareEnabled =
    opts.compare === true || typeof opts.baseline === 'string'
  let compareIface: any = null
  if (compareEnabled) {
    const baselineArg = typeof opts.baseline === 'string' ? opts.baseline : true
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

  const ifaces = [
    cliIface,
    opts.interactive && (await import('./interfaces/interactive.js')).default(),
    opts.json &&
      (await import('./interfaces/json.js')).default(opts.json, { n }),
    opts.datadog &&
      (await import('./interfaces/datadog.js')).default(
        typeof opts.datadog === 'string' ? { host: opts.datadog } : undefined
      ),
    opts.snowflake &&
      (await import('./interfaces/snowflake.js')).default(
        typeof opts.snowflake === 'string'
          ? { gatewayUri: opts.snowflake }
          : undefined
      ),
    opts.console !== false &&
      (await import('./interfaces/console.js')).default({ n }),
    compareIface,
    snapshotIface,
  ].filter((x) => x)
  await runScenarios(scenarios, compose(...ifaces), { n, warmup })
}
