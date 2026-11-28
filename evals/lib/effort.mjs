export function effort(raw, pricing = null) {
  const events = raw
    .split('\n')
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line)]
      } catch {
        return []
      }
    })
  const claude = events.findLast(
    (event) => event.type === 'result' && event.usage
  )
  const messages = new Map()
  if (!claude) {
    for (const event of events) {
      const message = event.type === 'assistant' && event.message
      if (!message?.id || !message.usage) continue
      const previous = messages.get(message.id) ?? {}
      const usage = {}
      for (const name of [
        'input_tokens',
        'output_tokens',
        'cache_read_input_tokens',
        'cache_creation_input_tokens',
      ]) {
        usage[name] = Math.max(previous[name] ?? 0, message.usage[name] ?? 0)
      }
      messages.set(message.id, usage)
    }
  }
  if (claude || messages.size) {
    const usage =
      claude?.usage ??
      [...messages.values()].reduce((sum, item) => {
        for (const [name, value] of Object.entries(item)) {
          sum[name] = (sum[name] ?? 0) + value
        }
        return sum
      }, {})
    const cached = usage.cache_read_input_tokens ?? 0
    const written = usage.cache_creation_input_tokens ?? 0
    return {
      inputTokens: (usage.input_tokens ?? 0) + cached + written,
      cachedInputTokens: cached,
      cacheWriteInputTokens: written,
      outputTokens: usage.output_tokens ?? null,
      estimatedModelUsd: pricing
        ? (usage.input_tokens ?? 0) * Number(pricing.input) +
          cached * Number(pricing.input_cache_read) +
          written * Number(pricing.input_cache_write ?? pricing.input) +
          (usage.output_tokens ?? 0) * Number(pricing.output)
        : null,
      traceSeconds: null,
    }
  }
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
