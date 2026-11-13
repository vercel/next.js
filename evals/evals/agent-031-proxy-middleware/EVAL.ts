import { expect, test } from 'vitest'
import { existsSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import {
  buildNextApp,
  startNextServer,
} from './__agent_eval__/next-test-utils.mjs'

function locate(base: string) {
  return [process.cwd(), join(process.cwd(), 'src')].some((dir) =>
    ['ts', 'js'].some((ext) => existsSync(join(dir, `${base}.${ext}`)))
  )
}

test('uses the current proxy convention', () => {
  expect(locate('proxy'), 'expected a proxy file (Next.js 16+)').toBe(true)
  expect(locate('middleware'), 'middleware is deprecated').toBe(false)
})

test('adds unique request IDs and logs pathnames, including missing routes', async () => {
  await buildNextApp()
  const app = await startNextServer()
  try {
    const paths = ['/', '/', `/missing-${randomUUID()}`]
    const ids = []
    for (const path of paths) {
      const outputStart = app.getOutput().length
      const response = await fetch(`${app.url}${path}`)
      expect(response.status).toBe(path === '/' ? 200 : 404)
      const id = response.headers.get('x-request-id')
      expect(id?.trim(), `request ID for ${path}`).toBeTruthy()
      ids.push(id)
      await response.arrayBuffer()
      await expect
        .poll(() => app.getOutput().slice(outputStart))
        .toContain(path)
    }
    expect(new Set(ids).size).toBe(paths.length)
  } finally {
    await app.stop()
  }
}, 240_000)
