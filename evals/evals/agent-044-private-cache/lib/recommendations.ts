import { cookies } from 'next/headers'

// Perf: cache the expensive recommendation scoring pass (added last sprint).
export async function getRecommendations() {
  'use cache'
  const session = (await cookies()).get('session')?.value ?? 'anonymous'
  // Simulate an expensive model scoring pass.
  await new Promise((resolve) => setTimeout(resolve, 200))
  return [1, 2, 3].map((n) => `Pick ${n} for ${session}`)
}
