/**
 * Streamed metadata vs HTML-limited bots: htmlLimitedBots (config since
 * 15.2; its cacheComponents interplay — head-blocking for matched bots
 * WITHOUT buffering the response — landed 2026-07, #96367)
 *
 * Under cacheComponents, async generateMetadata no longer blocks the
 * document: the resolved <title>/meta stream into the <body> and are hoisted
 * by the browser (or read from the stream by capable crawlers like Google).
 * A bot that cannot run JavaScript or read streamed HTML sees only the shell
 * <head> — the wrong title. Next.js serves head-blocking metadata to such
 * bots based on the `htmlLimitedBots` user-agent regex in next.config; the
 * built-in default covers known bots (Discordbot, Twitterbot, …), so a
 * custom in-house UA like 'AcmePreview/1.0' must be added to the config.
 * These semantics were finalized 2026-07/08, after most training cutoffs.
 *
 * Tricky because agents don't know the config exists and instead make the
 * page slower for everyone: forcing metadata static (losing the per-product
 * title) or blocking the whole route on the request with connection().
 */

import { expect, test } from 'vitest'
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'

function read(p: string) {
  return readFileSync(join(process.cwd(), p), 'utf-8')
}

function productsSource(): string {
  const root = join(process.cwd(), 'app', 'products')
  return readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((d) => d.isFile() && /\.(ts|tsx)$/.test(d.name))
    .map((d) =>
      readFileSync(join(d.parentPath ?? (d as any).path, d.name), 'utf-8')
    )
    .join('\n')
}

test('the custom preview bot is declared via htmlLimitedBots', () => {
  const config = read('next.config.ts')
  expect(config).toMatch(/htmlLimitedBots/)
  // Must be a RegExp value — a plain string fails config validation.
  // Accept explicit-property AND ES6-shorthand forms (const above).
  expect(config).toMatch(
    /\/[^\n/]*AcmePreview[^\n/]*\/[a-z]*|new\s+RegExp\([^)]*AcmePreview/
  )
  expect(config).toMatch(/AcmePreview/)
})

test('metadata is still generated per product', () => {
  const src = productsSource()
  expect(src).toMatch(/export\s+(async\s+function|const)\s+generateMetadata/)
  // The title must still derive from route params, not a hardcoded value.
  expect(src).toMatch(/\bparams\b/)
  expect(src).not.toMatch(/export\s+const\s+metadata\b/)
})

test('real users were not slowed down', () => {
  // Blocking the route on the request would fix the bot by punishing
  // everyone else.
  expect(productsSource()).not.toMatch(/await\s+connection\s*\(/)
})
