import picocolors from 'picocolors'
import { Interface } from '../index.js'
import { formatUnit } from '../units.js'
import { formatVariant } from '../utils.js'

const { bgCyan, bold, cyan, dim, magenta, red, underline } = picocolors

export default function createInterface(
  options: { n?: number } = {}
): Interface {
  const n = options.n ?? 1
  const showSummary = n > 1
  const iface: Interface = {
    start: async (scenario, props, runInfo) => {
      const label = formatVariant(scenario, props)
      let progress = ''
      if (runInfo) {
        progress = runInfo.warmup
          ? ` [warmup ${runInfo.run}/${runInfo.total}]`
          : ` [${runInfo.run}/${runInfo.total}]`
      }
      console.log(bold(underline(`Running ${label}...${progress}`)))
    },
    measurement: async (scenario, props, name, value, unit, relativeTo) => {
      console.log(
        bgCyan(
          bold(
            magenta(
              `${formatVariant(scenario, props)}: ${name} = ${formatUnit(
                value,
                unit
              )}${relativeTo ? ` (from ${relativeTo})` : ''}`
            )
          )
        )
      )
    },
    variantStatistics: async (scenario, props, stats) => {
      if (!showSummary) return
      const header = `${formatVariant(scenario, props)}  (n=${n})`
      console.log(bold(cyan(header)))
      for (const [name, s] of Object.entries(stats)) {
        const meanText = formatUnit(s.mean, s.unit)
        const p50Text = formatUnit(s.p50, s.unit)
        const p90Text = formatUnit(s.p90, s.unit)
        const relText = s.relativeTo ? dim(` (from ${s.relativeTo})`) : ''
        console.log(
          `  ${name}: mean=${meanText}  p50=${p50Text}  p90=${p90Text}${relText}`
        )
      }
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
      )
    },
  }

  return iface
}
