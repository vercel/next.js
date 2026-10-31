import { a1 } from 'pkg-a/a1.js'
import { a2 } from 'pkg-a/a2.js'
import { a3 } from 'pkg-a/a3.js'
import { b1 } from 'pkg-b/b1.js'
import { b2 } from 'pkg-b/b2.js'
import { b3 } from 'pkg-b/b3.js'
import { readChunkModules } from '../../chunk-files.js'

it('splits oversized chunks at package boundaries', () => {
  const values = { a1, a2, a3, b1, b2, b3 }
  for (const [name, value] of Object.entries(values)) {
    expect(value.startsWith(`${name}: `)).toBe(true)
  }
  const chunks = readChunkModules(values, 2500)
  expect(chunks.map((chunk) => chunk.modules)).toEqual([
    ['a1', 'a2', 'a3'],
    ['b1', 'b2', 'b3'],
  ])
})
