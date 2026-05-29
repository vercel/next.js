import { Interface } from '../index.js'
import { quantile, mean as statsMean } from '../statistics.js'
import { formatUnit } from '../units.js'
import { writeFile } from 'fs/promises'

function filterProp(
  prop: Record<string, string | number | boolean | null>
): Record<string, string | number | boolean> {
  const filteredProp: Record<string, string | number | boolean> = {}
  for (const [key, value] of Object.entries(prop)) {
    if (value !== null) {
      filteredProp[key] = value
    }
  }
  return filteredProp
}

export default function createInterface(
  file: string = (() => {
    const file = process.env.JSON_OUTPUT_FILE
    if (!file) {
      throw new Error('env var JSON_OUTPUT_FILE is not set')
    }
    return file
  })(),
  options: { n?: number } = {}
): Interface {
  const n = options.n ?? 1
  // Per-(scenario, props, name) sample accumulator.
  const metrics = new Map<
    string,
    {
      key: Record<string, string | number>
      samples: number[]
      unit: string
      relativeTo?: string
    }
  >()
  const iface: Interface = {
    measurement: async (scenario, props, name, value, unit, relativeTo) => {
      const keyObject = {
        scenario: scenario,
        ...filterProp(props),
        name: name,
      }
      const key = JSON.stringify(keyObject)
      const current = metrics.get(key)
      if (current) {
        current.samples.push(value)
      } else {
        metrics.set(key, {
          key: keyObject,
          samples: [value],
          unit,
          relativeTo,
        })
      }
    },
    finish: async () => {
      const results = [...metrics.values()].map(
        ({ key, samples, unit, relativeTo }) => {
          if (samples.length === 1) {
            // Preserve the original single-run shape exactly for back-compat.
            return {
              key,
              value: samples[0],
              unit,
              text: formatUnit(samples[0], unit),
              datapoints: 1,
              relativeTo,
            }
          }
          const m = statsMean(samples)
          return {
            key,
            value: m,
            unit,
            text: formatUnit(m, unit),
            datapoints: samples.length,
            mean: m,
            p50: quantile(samples, 0.5),
            p90: quantile(samples, 0.9),
            samples,
            relativeTo,
          }
        }
      )
      const payload = n > 1 ? { results } : (results as unknown)
      await writeFile(file, JSON.stringify(payload))
    },
  }

  return iface
}
