import { readFileSync, readdirSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const root = resolve(process.argv[2] || 'evals/results/pokedex-dev-loop-cc')
const pricingFile = process.argv[3]
const pricing = pricingFile
  ? JSON.parse(readFileSync(pricingFile, 'utf8')).pricing
  : null

function findRuns(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (
      entry.isDirectory() &&
      !['project', 'workspace', 'harness'].includes(entry.name)
    )
      return findRuns(path)
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

// This study's Codex session records cumulative usage and per-request usage.
// Do not sum cumulative totals, or count reasoning tokens a second time.
function effort(raw) {
  const events = raw
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line))
  const turns = events.filter(
    (event) => event.type === 'turn.completed' && event.usage
  )
  if (turns.length) {
    const usage = turns.reduce((sum, { usage }) => {
      for (const name of [
        'input_tokens',
        'cached_input_tokens',
        'cache_write_input_tokens',
        'output_tokens',
      ]) {
        sum[name] = (sum[name] || 0) + (usage[name] || 0)
      }
      return sum
    }, {})
    // CLI turns aggregate several API requests, so they cannot select a
    // per-request context-price tier. Report a base-rate estimate explicitly.
    const uncached =
      usage.input_tokens -
      usage.cached_input_tokens -
      usage.cache_write_input_tokens
    const cost = pricing
      ? uncached * Number(pricing.input) +
        usage.cached_input_tokens * Number(pricing.input_cache_read) +
        usage.cache_write_input_tokens *
          Number(pricing.input_cache_write ?? pricing.input) +
        usage.output_tokens * Number(pricing.output)
      : null
    return {
      inputTokens: usage.input_tokens,
      cachedInputTokens: usage.cached_input_tokens,
      cacheWriteInputTokens: usage.cache_write_input_tokens,
      outputTokens: usage.output_tokens,
      estimatedModelUsd: cost,
      pricingMethod: 'base rates; CLI stream aggregates API requests',
      traceSeconds: null,
    }
  }
  let total = null
  let previousTotal = -1
  let cost = pricing ? 0 : null
  const times = []
  for (const event of events) {
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
    const verification = JSON.parse(
      read(join(dir, 'verification.json')) || 'null'
    )
    const acceptance = JSON.parse(read(join(dir, 'acceptance.json')) || 'null')
    const pageMeasurements = JSON.parse(
      read(join(dir, 'measurements.json')) || 'null'
    )
    return {
      run: relative(root, dir),
      model: result.observedModel || result.model,
      status: verification
        ? verification.acceptanceExitCode === 0
          ? 'passed'
          : 'failed'
        : result.status,
      runnerSeconds: result.duration,
      ...effort(read(join(dir, 'transcript-raw.jsonl'))),
      agentSeconds: result.agentSeconds ?? null,
      ...(acceptance ? { acceptance: acceptance.stats } : {}),
      ...(pageMeasurements ? { pageMeasurements } : {}),
      measurementStatus: pageMeasurements ? 'collected' : 'missing',
    }
  })

console.log(
  JSON.stringify(
    {
      notes: [
        'Input tokens include cached input; cached input is shown separately, not added again.',
        'Cost is an estimate using the supplied pricing, not a billing receipt. CLI aggregate usage uses base rates; per-request tiers are unavailable. Sandbox and serving cost are excluded.',
        'Agent time excludes setup and verification. Runner time includes setup and any verification performed in that runner. Missing evidence remains null.',
        'Lighthouse medians describe three mobile page-load lab samples, not field Core Web Vitals, INP, or complete UX quality.',
      ],
      runs: rows,
    },
    null,
    2
  )
)
