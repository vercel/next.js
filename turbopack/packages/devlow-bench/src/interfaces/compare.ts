import { Interface } from '../index.js'
import { SampleGroup, groupRows, makeKey, printComparison } from '../compare.js'
import { readSnapshot } from '../snapshot.js'
import { formatVariantProps } from '../utils.js'

export default async function createInterface(options: {
  baselinePath: string
}): Promise<Interface> {
  const baselinePath = options.baselinePath
  const baselineRows = await readSnapshot(baselinePath)
  const baseline = groupRows(baselineRows)
  const current = new Map<string, SampleGroup>()

  return {
    variantStatistics: async (scenario, props, stats) => {
      const variant = formatVariantProps(props)
      for (const [metric, s] of Object.entries(stats)) {
        const key = makeKey(scenario, variant, metric)
        current.set(key, {
          scenario,
          variant,
          metric,
          unit: s.unit,
          samples: s.samples.slice(),
        })
      }
    },
    finish: async () => {
      printComparison(baseline, current, { baselineLabel: baselinePath })
    },
  }
}
