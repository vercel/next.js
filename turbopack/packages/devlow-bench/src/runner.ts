import { withCurrent } from './describe.js'
import {
  FullInterface,
  Interface,
  Scenario,
  VariantStatistic,
  intoFullInterface,
} from './index.js'
import { summary } from './statistics.js'

interface SampleSet {
  samples: number[]
  unit: string
  relativeTo?: string
}

export async function runScenarios(
  scenarios: Scenario[],
  iface: Interface,
  options: { n?: number; warmup?: number } = {}
): Promise<void> {
  const n = Math.max(1, Math.floor(options.n ?? 1))
  const warmup = Math.max(0, Math.floor(options.warmup ?? 0))
  const fullIface = intoFullInterface(iface)
  if (scenarios.some((scenario) => scenario.only)) {
    scenarios = scenarios.filter((scenario) => scenario.only)
  }
  scenarios = await fullIface.filterScenarios(scenarios)
  let variants = []
  for (const scenario of scenarios) {
    let props = [{}]
    for (const [key, options] of Object.entries(scenario.config)) {
      const newProps = []
      for (const prop of props) {
        if (prop === 'scenario' || prop === 'name')
          throw new Error("Cannot use 'scenario' or 'name' as a property name")
        for (const value of options) {
          newProps.push({
            ...prop,
            [key]: value,
          })
        }
      }
      props = newProps
    }
    variants.push(
      ...props.map((props) => ({
        scenario,
        props,
      }))
    )
  }
  variants = await fullIface.filterScenarioVariants(variants)

  for (const variant of variants) {
    const samplesByMetric = new Map<string, SampleSet>()

    // Wrap the interface for this variant so that per-sample `measurement`
    // calls (a) flow through to all underlying reporters (preserving Datadog /
    // Snowflake / etc. behavior) and (b) get collected into samplesByMetric
    // for aggregation. Only counted on non-warmup runs.
    let collecting = false
    const wrappedIface: FullInterface = {
      ...fullIface,
      measurement: async (scenario, props, name, value, unit, relativeTo) => {
        if (collecting) {
          const existing = samplesByMetric.get(name)
          if (existing) {
            existing.samples.push(value)
          } else {
            samplesByMetric.set(name, {
              samples: [value],
              unit,
              relativeTo,
            })
          }
        }
        await fullIface.measurement(
          scenario,
          props,
          name,
          value,
          unit,
          relativeTo
        )
      },
    }

    const totalRuns = warmup + n
    let aborted = false
    for (let run = 0; run < totalRuns; run++) {
      collecting = run >= warmup
      // Only report run progress when the user is actually doing multiple
      // runs. Single-sample runs don't need a "[1/1]" tag.
      const runInfo =
        totalRuns > 1
          ? run < warmup
            ? { run: run + 1, total: warmup, warmup: true }
            : { run: run - warmup + 1, total: n, warmup: false }
          : undefined
      try {
        const measurements = new Map()
        await withCurrent(
          {
            iface: wrappedIface,
            measurements,
            scenario: variant,
          },
          async () => {
            await wrappedIface.start(
              variant.scenario.name,
              variant.props,
              runInfo
            )
            measurements.set('start', {
              value: Date.now(),
              unit: 'ms',
            })
            await variant.scenario.fn(variant.props)
            await wrappedIface.end(variant.scenario.name, variant.props)
          }
        )
      } catch (e) {
        await wrappedIface.error(variant.scenario.name, variant.props, e)
        process.exitCode = 1
        aborted = true
        break
      }
    }

    if (!aborted && samplesByMetric.size > 0) {
      const stats: Record<string, VariantStatistic> = {}
      for (const [name, set] of samplesByMetric) {
        stats[name] = {
          samples: set.samples,
          unit: set.unit,
          relativeTo: set.relativeTo,
          ...summary(set.samples),
        }
      }
      await fullIface.variantStatistics(
        variant.scenario.name,
        variant.props,
        stats
      )
    }
  }

  await fullIface.finish()
}
