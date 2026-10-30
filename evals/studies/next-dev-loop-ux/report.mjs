import { readFileSync, readdirSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const root = resolve(process.argv[2] || 'evals/results/catalog-ux-poc')
const pricingFile = process.argv[3]
const pricing = pricingFile
  ? JSON.parse(readFileSync(pricingFile, 'utf8')).pricing
  : null

function findRuns(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory() && entry.name !== 'project') return findRuns(path)
    return entry.isFile() && entry.name === 'result.json' ? [path] : []
  })
}

function read(path) {
  try {
    return readFileSync(path, 'utf8')
  } catch (error) {
    if (error.code === 'ENOENT') return ''
    throw error
  }
}

function median(values) {
  const numbers = values.filter(Number.isFinite).sort((a, b) => a - b)
  if (!numbers.length) return null
  const middle = Math.floor(numbers.length / 2)
  return numbers.length % 2
    ? numbers[middle]
    : (numbers[middle - 1] + numbers[middle]) / 2
}

// This study's Codex session records cumulative usage and per-request usage.
// Do not sum cumulative totals, or count reasoning tokens a second time.
function effort(raw) {
  let total = null
  let previousTotal = -1
  let cost = pricing ? 0 : null
  const times = []
  for (const line of raw.split('\n').filter(Boolean)) {
    const event = JSON.parse(line)
    const time = Date.parse(event.timestamp)
    if (Number.isFinite(time)) times.push(time)
    const info = event.payload?.type === 'token_count' && event.payload.info
    if (!info?.total_token_usage) continue
    total = info.total_token_usage
    if (total.total_tokens === previousTotal) continue
    previousTotal = total.total_tokens
    const usage = info.last_token_usage
    if (!usage || !pricing) {
      cost = null
      continue
    }
    const rate = (name) => {
      const tier = pricing[`${name}_tiers`]?.find(
        ({ min, max }) =>
          usage.input_tokens >= min && (max == null || usage.input_tokens < max)
      )
      return Number(tier?.cost ?? pricing[name])
    }
    if (cost !== null) {
      cost +=
        (usage.input_tokens - usage.cached_input_tokens) * rate('input') +
        usage.cached_input_tokens * rate('input_cache_read') +
        usage.output_tokens * rate('output')
    }
  }
  return {
    inputTokens: total?.input_tokens ?? null,
    cachedInputTokens: total?.cached_input_tokens ?? null,
    outputTokens: total?.output_tokens ?? null,
    estimatedModelUsd: total && Number.isFinite(cost) ? cost : null,
    traceSeconds:
      times.length > 1
        ? (Math.max(...times) - Math.min(...times)) / 1000
        : null,
  }
}

const rows = findRuns(root)
  .sort()
  .map((path) => {
    const dir = resolve(path, '..')
    const result = JSON.parse(readFileSync(path, 'utf8'))
    const output = read(join(dir, 'outputs/eval.txt'))
    const match = output.match(/CATALOG_UX_METRICS (\{[^\n]+\})/)
    const measurements = match ? JSON.parse(match[1]) : null
    const samples = measurements?.samples || []
    const metrics = Object.fromEntries(
      [
        'lcpMs',
        'cls',
        'tbtMs',
        'jsTransferBytes',
        'totalTransferBytes',
        'accessibilityScore',
      ].map((name) => [name, median(samples.map((sample) => sample[name]))])
    )
    return {
      run: relative(root, dir),
      model: result.observedModel || result.model,
      status: result.status,
      runSecondsIncludingSetupAndVerifier: result.duration,
      ...effort(read(join(dir, 'transcript-raw.jsonl'))),
      measurementStatus: measurements?.status || 'missing',
      metricMedians: metrics,
      measurements,
    }
  })

console.log(
  JSON.stringify(
    {
      notes: [
        'Input tokens include cached input; cached input is shown separately, not added again.',
        'Cost is a token-price estimate using the supplied pricing, not a billing receipt. Sandbox and serving cost are excluded.',
        'Trace time excludes setup and verification; missing evidence remains null.',
        'Lighthouse medians describe three mobile page-load lab samples, not field Core Web Vitals, INP, or complete UX quality.',
      ],
      runs: rows,
    },
    null,
    2
  )
)
