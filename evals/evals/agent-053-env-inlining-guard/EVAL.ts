/**
 * Volatile system-env inlining guardrail (TP1202, 2026-02)
 *
 * Inlining NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA into client code rehashes the
 * chunks on every deploy. The 2026-02 guardrail is
 * `experimental.reportSystemEnvInlining: 'error'` (Turbopack), whose TP1202
 * error steers toward process.env.NEXT_DEPLOYMENT_ID / server-side reads.
 *
 * Tricky because pre-2026 agents memoize the component, move the var to
 * .env, or suggest webpack DefinePlugin hygiene — none of which stop the
 * per-deploy chunk hash churn or add a build-time guard.
 */

import { expect, test } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

function read(p: string) {
  return readFileSync(join(process.cwd(), p), 'utf-8')
}

test('build-time guardrail is enabled at error level', () => {
  expect(read('next.config.ts')).toMatch(
    /reportSystemEnvInlining\s*:\s*['"]error['"]/
  )
})

test('the footer no longer inlines the per-deploy commit sha', () => {
  expect(read('app/footer.tsx')).not.toMatch(
    /NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA/
  )
})

test('footer still exists and renders deploy info some stable way', () => {
  const footer = read('app/footer.tsx')
  const page = read('app/page.tsx')
  expect(page).toMatch(/DeployFooter/)
  expect(footer.length).toBeGreaterThan(40)
})
