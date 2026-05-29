import { withCurrent } from './describe.js'
import {
  FullInterface,
  Interface,
  Scenario,
  VariantStatistic,
  intoFullInterface,
} from './index.js'
import { summary } from './statistics.js'
import { formatVariant } from './utils.js'

interface SampleSet {
  samples: number[]
  unit: string
  relativeTo?: string
}

interface BufferedSample {
  value: number
  unit: string
  relativeTo?: string
}

// Total attempts per variant are capped at this multiple of the requested
// `warmup + n`. Allows retrying flaky runs without burning unbounded time when
// every attempt fails.
const MAX_ATTEMPT_MULTIPLIER = 2

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
  let totalFailedAttempts = 0
  let variantsWithRetries = 0
  let variantsShortOfTarget = 0
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

    // Each attempt buffers its measurements here. On success we merge into
    // `samplesByMetric`; on failure we discard, so a partial run can't
    // pollute the aggregated stats. Downstream per-sample reporters (Datadog,
    // console, …) still receive every measurement inline — only the
    // aggregated per-variant samples are gated on success.
    let collecting = false
    let perRun = new Map<string, BufferedSample[]>()
    const wrappedIface: FullInterface = {
      ...fullIface,
      measurement: async (scenario, props, name, value, unit, relativeTo) => {
        if (collecting) {
          let list = perRun.get(name)
          if (!list) {
            list = []
            perRun.set(name, list)
          }
          list.push({ value, unit, relativeTo })
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

    const maxAttempts = (warmup + n) * MAX_ATTEMPT_MULTIPLIER
    const showRunInfo = warmup + n > 1
    let warmupDone = 0
    let collectedRuns = 0
    let totalAttempts = 0

    while (
      (warmupDone < warmup || collectedRuns < n) &&
      totalAttempts < maxAttempts
    ) {
      totalAttempts++
      const isWarmup = warmupDone < warmup
      collecting = !isWarmup
      perRun = new Map()
      const runInfo = showRunInfo
        ? isWarmup
          ? { run: warmupDone + 1, total: warmup, warmup: true }
          : { run: collectedRuns + 1, total: n, warmup: false }
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
        if (collecting) {
          // Commit the buffered samples for this run into the aggregate.
          for (const [name, entries] of perRun) {
            let set = samplesByMetric.get(name)
            if (!set) {
              const first = entries[0]
              set = {
                samples: [],
                unit: first.unit,
                relativeTo: first.relativeTo,
              }
              samplesByMetric.set(name, set)
            }
            for (const e of entries) {
              set.samples.push(e.value)
            }
          }
          collectedRuns++
        } else {
          warmupDone++
        }
      } catch (e) {
        await wrappedIface.error(variant.scenario.name, variant.props, e)
        // Loop continues; the buffered samples for this attempt are dropped
        // when `perRun` is replaced on the next iteration.
      }
    }

    const failedAttempts = totalAttempts - warmupDone - collectedRuns
    if (failedAttempts > 0) {
      const label = formatVariant(variant.scenario.name, variant.props)
      console.log(
        `${label}: collected ${collectedRuns}/${n} samples after ${totalAttempts} attempts (${failedAttempts} failed)`
      )
      totalFailedAttempts += failedAttempts
      variantsWithRetries++
    }
    if (collectedRuns < n) {
      process.exitCode = 1
      variantsShortOfTarget++
    }

    if (samplesByMetric.size > 0) {
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

  if (totalFailedAttempts > 0) {
    const recovered = variantsWithRetries - variantsShortOfTarget
    const parts: string[] = []
    if (recovered > 0) {
      parts.push(
        `${recovered} variant${recovered === 1 ? '' : 's'} hit n=${n} after retries`
      )
    }
    if (variantsShortOfTarget > 0) {
      parts.push(
        `${variantsShortOfTarget} variant${variantsShortOfTarget === 1 ? '' : 's'} fell short of n=${n}`
      )
    }
    console.log(
      `\n${totalFailedAttempts} failed attempt${totalFailedAttempts === 1 ? '' : 's'} across ${variantsWithRetries} variant${variantsWithRetries === 1 ? '' : 's'}: ${parts.join('; ')}.`
    )
  }

  await fullIface.finish()
}
