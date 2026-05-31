// Shared value for the reconcile test: an action writes it, the page reads it.
// We use a cookie, not a module variable, because the action and the render can
// run in different places (different module copies on webpack, or separate
// lambdas on deploy) and wouldn't see each other's writes. A cookie travels with
// the browser, so the read always sees the latest write.
import { cookies } from 'next/headers'

const COOKIE = 'psf-reconcile'

export async function writeReconcile(value: number): Promise<void> {
  ;(await cookies()).set(COOKIE, String(value))
}

export async function readReconcile(): Promise<number> {
  const n = Number((await cookies()).get(COOKIE)?.value)
  return Number.isFinite(n) ? n : 0
}
