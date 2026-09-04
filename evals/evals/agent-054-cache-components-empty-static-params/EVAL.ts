/**
 * Preserve on-demand ISR when adopting Cache Components
 *
 * The starting route uses the previous on-demand ISR pattern:
 * `force-static`, `revalidate`, and an empty `generateStaticParams` result.
 * Cache Components rejects an empty result, but deleting the function changes
 * the route to request-time rendering. The migration must retain the export
 * and give it at least one param so other params can still be cached on demand.
 */

import { expect, test } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const config = readFileSync(join(process.cwd(), 'next.config.ts'), 'utf-8')
const eventPage = readFileSync(
  join(process.cwd(), 'app/events/[slug]/page.tsx'),
  'utf-8'
)
const eventPageWithoutComments = eventPage
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\/\/.*$/gm, '')

test('enables Cache Components', () => {
  expect(config).toMatch(/cacheComponents\s*:\s*true/)
})

test('preserves generateStaticParams for on-demand ISR', () => {
  expect(eventPageWithoutComments).toMatch(
    /export\s+(?:(?:async\s+)?function\s+generateStaticParams\b|const\s+generateStaticParams\s*=)/
  )
})

test('generateStaticParams no longer returns an empty array', () => {
  expect(eventPageWithoutComments).not.toMatch(
    /generateStaticParams[\s\S]*?return\s*\[\s*\]/
  )
})
