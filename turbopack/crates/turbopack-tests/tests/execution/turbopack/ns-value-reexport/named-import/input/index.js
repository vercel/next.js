// The real-world zod shape: `z` is a namespace that lib.js hands out as a plain
// value, and the consumer only ever reads static members of it.
import { z } from './lib.js'
import { bundledCode } from '../../../__helpers__/module-factories.js'

it('reads static members of a namespace reexported as a value', () => {
  expect([z.object(), z.string(), z.defaultLocale]).toEqual([
    'object',
    'string',
    'EN_USED_MARKER',
  ])
})

it('drops unused exports reachable only through the namespace value', () => {
  const code = bundledCode()
  // Built dynamically so this test file itself doesn't contain the markers.
  const marker = (locale) => `${locale}_UNUSED_MARKER`
  expect(code).not.toContain(marker('DE'))
  expect(code).not.toContain(marker('FR'))
})
