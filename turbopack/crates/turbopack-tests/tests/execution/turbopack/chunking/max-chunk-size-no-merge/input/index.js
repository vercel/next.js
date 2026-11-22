import { a } from './a/a.js'
import { b } from './b/b.js'
import { c } from './c/c.js'
import { readChunkModules } from '../../chunk-files.js'

it('splits oversized chunks when merging is disabled', () => {
  const values = { a, b, c }
  for (const [name, value] of Object.entries(values)) {
    expect(value.startsWith(`${name}: `)).toBe(true)
  }
  const chunks = readChunkModules(values, 1500)
  expect(chunks.length).toBeGreaterThan(1)
  for (const chunk of chunks) {
    expect(chunk.modules.length).toBeLessThanOrEqual(2)
  }
})
