/**
 * Server Actions dispatch sequentially — batch instead of Promise.all
 *
 * Server Actions are dispatched one at a time per client by design (a
 * serialized queue, unlike parallel fetches), so
 * `Promise.all(ids.map((id) => action(id)))` is N sequential round trips:
 * 40 messages x 300ms ≈ 12s. The fix is a single batched action that
 * accepts the whole id array in one round trip (parallelizing the work
 * server-side inside that one action is fine).
 *
 * Tricky because agents assume actions parallelize like fetch() and keep
 * the Promise.all fan-out, or dodge the semantics entirely by converting
 * the mutation to a route handler + client fetch — banned here because the
 * task is about action dispatch semantics, not transport.
 */

import { expect, test } from 'vitest'
import { readFileSync, readdirSync, existsSync } from 'fs'
import { join } from 'path'

function allSourceFiles(dir: string): string[] {
  const root = join(process.cwd(), dir)
  if (!existsSync(root)) return []
  return readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((d) => d.isFile() && /\.(ts|tsx)$/.test(d.name))
    .map((d) => join(d.parentPath ?? (d as any).path, d.name))
}

function sourceFiles(): { path: string; content: string }[] {
  return [...allSourceFiles('lib'), ...allSourceFiles('app')].map((p) => ({
    path: p,
    content: readFileSync(p, 'utf-8'),
  }))
}

test('a server action accepts the whole id array', () => {
  const batched = sourceFiles().filter(
    (f) =>
      /['"]use server['"]/.test(f.content) &&
      // Name-agnostic: any parameter typed as a string array (plain,
      // readonly, destructured, or Array<string>) counts as batched.
      /[({,\s]\w+\s*:\s*(readonly\s+)?(string\[\]|Array<string>)/.test(
        f.content
      )
  )
  expect(batched.length).toBeGreaterThan(0)
})

test('the client no longer fans out one action per id', () => {
  // The anti-pattern is N dispatches from the client. Server-side
  // parallelism inside the single batched action is legitimate, so the ban
  // is scoped to client components.
  for (const f of sourceFiles()) {
    if (/['"]use client['"]/.test(f.content)) {
      expect(f.content).not.toMatch(/Promise\.all\s*\(\s*ids\.map/)
    }
  }
})

test('the mutation was not converted to a route handler', () => {
  for (const f of allSourceFiles('app')) {
    expect(readFileSync(f, 'utf-8')).not.toMatch(/fetch\s*\(\s*['"]\/api/)
  }
  expect(existsSync(join(process.cwd(), 'app', 'api'))).toBe(false)
})

test('the archive flow still goes through a server action', () => {
  const actionFiles = sourceFiles().filter((f) =>
    /['"]use server['"]/.test(f.content)
  )
  expect(actionFiles.length).toBeGreaterThan(0)
})
