import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { cacheLife } from 'next/cache'

export interface Dictionary {
  greeting: string
  tagline: string
  nav: { home: string; about: string }
  about: { heading: string; body: string }
  /** Opaque stamp minted once per dictionary load, for cache diagnostics. */
  loadedAt: string
}

/**
 * Cached translation loader.
 *
 * PUBLIC API — FROZEN SIGNATURE. getDictionary() takes no arguments and a
 * dozen call sites (including other teams' packages) call it exactly like
 * that. Do not add parameters and do not change how call sites invoke it.
 *
 * TODO(i18n): we launched English-only, so this always loads en.json. Now
 * that /fr is live this is wrong, but from in here we have no way to know
 * which locale the current page is for.
 */
export async function getDictionary(): Promise<Dictionary> {
  'use cache'
  cacheLife({ revalidate: 600 })
  const raw = await readFile(
    join(process.cwd(), 'data', 'dictionaries', 'en.json'),
    'utf8'
  )
  const messages = JSON.parse(raw) as Omit<Dictionary, 'loadedAt'>
  return {
    ...messages,
    loadedAt: 'load-' + Math.random().toString(36).slice(2, 10),
  }
}
