// Request data: what makes the dynamic holes dynamic.
import { cookies } from 'next/headers'

export async function getSession() {
  const jar = await cookies()
  return {
    name: jar.get('bench-user')?.value ?? null,
    cartLines: Number(jar.get('bench-cart')?.value) || 0,
    currency: jar.get('bench-currency')?.value ?? 'USD',
  }
}

// BENCH_CC_HOLES=0 leaves the dynamic holes out, so every page is fully
// static. Read at render time (not at module scope) so one compiled build
// can be generated both ways. Call it from page components only, never
// from inside a `use cache` function: it is not part of any cache key.
export function holesEnabled() {
  return process.env.BENCH_CC_HOLES !== '0'
}
