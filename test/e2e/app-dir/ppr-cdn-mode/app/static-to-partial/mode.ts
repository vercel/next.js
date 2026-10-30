import * as fs from 'node:fs'
import { cacheTag, revalidateTag } from 'next/cache'

// Next to next.config.ts. `next build` and `next start` both run with the app
// root as CWD.
const MODE_FILE = process.cwd() + '/static-to-partial.json'

export type Mode = { partial: boolean }

export async function getMode(): Promise<Mode> {
  'use cache'
  cacheTag('ppr-cdn-mode:static-to-partial')
  return JSON.parse(
    fs.readFileSync(/*turbopackIgnore: true*/ MODE_FILE, 'utf8')
  )
}

export function setMode(mode: Mode) {
  fs.writeFileSync(/*turbopackIgnore: true*/ MODE_FILE, JSON.stringify(mode))
  revalidateTag('ppr-cdn-mode:static-to-partial', { expire: 0 })
}
