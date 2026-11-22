import { cssSources, readCssChunks } from '../../../__helpers__/css.js'

// Not called, the chunks are only inspected.
export const load = [
  () => import('./entry.css'),
  () => import('./b1.css'),
  () => import('./entry2.css'),
]

function chunkOf(entry) {
  const chunks = readCssChunks(import.meta.url).filter(
    (css) => cssSources(css).at(-1) === entry
  )
  expect(chunks).toHaveLength(1)
  return chunks[0]
}

// Each rule's `content` is its expected position in the chunk of `entry.css`.
function positions(entry) {
  return Array.from(chunkOf(entry).matchAll(/content: (["'])(.*?)\1/g), (m) =>
    Number(m[2])
  )
}

it('keeps the @import order of modules shared between chunks', () => {
  // `b5.css` (15) is not imported by any module.
  expect(positions('entry.css')).toEqual([
    1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 16, 17,
  ])
  expect(positions('b1.css')).toEqual([3, 4, 5])
})

it('includes all imported modules in the chunk of another entry', () => {
  const sources = cssSources(chunkOf('entry2.css'))
  expect([...sources].sort()).toEqual(
    [
      'b3.css',
      'b3a.css',
      'b3b.css',
      'b4.css',
      'b4a.css',
      'b4b.css',
      'entry2.css',
      'shared.css',
      'shared1.css',
    ].sort()
  )
  const before = (a, b) =>
    expect(sources.indexOf(a)).toBeLessThan(sources.indexOf(b))
  before('b4a.css', 'b4b.css')
  before('b4b.css', 'b4.css')
  before('b3a.css', 'b3b.css')
  before('b3b.css', 'b3.css')
  before('shared1.css', 'shared.css')
})
