import { cookies } from 'next/headers'

export interface Recommendations {
  picks: string[]
  computedAt: number
}

// Perf: cache the expensive recommendation scoring pass (added last sprint).
export async function getRecommendations(): Promise<Recommendations> {
  'use cache'
  const session = (await cookies()).get('session')?.value ?? 'anonymous'
  // Simulate an expensive model scoring pass.
  await new Promise((resolve) => setTimeout(resolve, 200))
  return {
    picks: [1, 2, 3].map((n) => `Pick ${n} for ${session}`),
    computedAt: Date.now(),
  }
}
