import { test, expect } from 'vitest'
import {
  defineConfig,
  defineProject,
  mergeConfig,
  configDefaults,
  defaultInclude,
  defaultExclude,
  defaultBrowserPort,
} from 'vitest/config'
test('configuration identities and merge precedence', () => {
  const base = {
    test: { include: ['a'], provide: { a: 1 } },
    resolve: { alias: [{ find: 'same', replacement: 'old' }] },
    ssr: { noExternal: true },
  }
  const config = mergeConfig(base, {
    test: { include: ['b'], provide: { b: 2 } },
    resolve: { alias: [{ find: 'same', replacement: 'new' }] },
    ssr: { noExternal: ['pkg'] },
  })
  expect(defineConfig(base)).toBe(base)
  expect(defineProject(base)).toBe(base)
  expect(config.test).toEqual({ include: ['a', 'b'], provide: { a: 1, b: 2 } })
  expect(config.resolve.alias.map((alias) => alias.replacement)).toEqual([
    'new',
    'old',
  ])
  expect(config.ssr.noExternal).toBe(true)
  expect(configDefaults.clearMocks).toBe(true)
  expect(defaultInclude).toContain('**/*.{test,spec}.?(c|m)[jt]s?(x)')
  expect(defaultExclude).toEqual(
    expect.arrayContaining(['**/node_modules/**', '**/.git/**'])
  )
  expect(defaultBrowserPort).toBe(63315)
})
