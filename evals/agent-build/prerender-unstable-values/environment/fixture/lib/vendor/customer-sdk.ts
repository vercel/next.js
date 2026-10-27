// Vendored copy of @pulse/customer-sdk 3.4.1. Do not edit; upgrade instead.
//
// The SDK wraps every lookup in request timing so the dashboard can chart
// backend latency per customer.

export type Customer = {
  id: string
  name: string
  plan: 'team' | 'enterprise'
  monitors: number
}

const directory: Record<string, Customer> = {
  ada: { id: 'ada', name: 'Ada Lovelace', plan: 'enterprise', monitors: 48 },
  grace: { id: 'grace', name: 'Grace Hopper', plan: 'team', monitors: 12 },
}

type Timing = { operation: string; startedAt: number; durationMs: number }

const timings: Timing[] = []

async function withTiming<T>(
  operation: string,
  run: () => Promise<T>
): Promise<T> {
  const startedAt = Date.now()
  const result = await run()
  timings.push({ operation, startedAt, durationMs: Date.now() - startedAt })
  return result
}

export function createCustomerClient() {
  return {
    async getCustomer(id: string): Promise<Customer | null> {
      return withTiming('customers.get', async () => {
        await new Promise((resolve) => setTimeout(resolve, 10))
        return directory[id] ?? null
      })
    },
  }
}
