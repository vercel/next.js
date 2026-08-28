export interface Quote {
  symbol: string
  price: number
  stamp: string
}

// Simulated upstream market feed: a deterministic generator advanced on
// every read. In production this would call the exchange's quote API; the
// generator keeps local dev and CI reproducible.
let seed = 0x2f6e2b1

function nextTick(): number {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff
  return seed
}

export async function getFreshQuote(): Promise<Quote> {
  const tick = nextTick()
  const price = (18000 + (tick % 4000)) / 100
  return { symbol: 'ACME', price, stamp: tick.toString(36) }
}
