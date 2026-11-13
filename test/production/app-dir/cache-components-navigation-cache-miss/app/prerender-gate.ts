import { existsSync, writeFileSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'
import { cacheLife } from 'next/cache'
import { workUnitAsyncStorage } from 'next/dist/server/app-render/work-unit-async-storage.external'

// Cached work keeps the static prerender pending until release. An uncached
// wait would become a dynamic hole.
async function waitForPrerenderRelease(testCase: string, held: boolean) {
  'use cache'
  cacheLife('hours')
  if (!held) {
    return
  }
  writeFileSync(testCase + '.held', '')
  for (let attempts = 0; !existsSync(testCase + '.release'); attempts++) {
    if (attempts === 2000) {
      throw new Error('Prerender was not released: ' + testCase)
    }
    await sleep(10)
  }
}

export async function prerenderGate(testCase: string) {
  if (workUnitAsyncStorage.getStore()?.type === 'prerender') {
    // The hold state changes the cache key so the build's resolved gate cannot
    // satisfy a held request.
    await waitForPrerenderRelease(testCase, existsSync(testCase + '.hold'))
  }
}
