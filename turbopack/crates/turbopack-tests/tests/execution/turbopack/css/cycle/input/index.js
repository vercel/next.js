import { cssSources, readCssChunks } from '../../../__helpers__/css.js'

// Not called, the chunks are only inspected.
export const load = [
  () => import('./1.css'),
  () => import('./2.css'),
  () => import('./x.css'),
  () => import('./y.css'),
  () => import('./i.css'),
]

// Each rule's `content` lists its expected position in the chunk of each entry
// it is part of (`index` selects the entry).
function positions(entry, index) {
  const chunks = readCssChunks(import.meta.url).filter(
    (css) => cssSources(css).at(-1) === entry
  )
  expect(chunks).toHaveLength(1)
  return Array.from(chunks[0].matchAll(/content: (["'])(.*?)\1/g), (match) =>
    Number(match[2].split(' ')[index])
  )
}

it('orders modules of an @import cycle from the entry', () => {
  expect(positions('1.css', 0)).toEqual([1, 2, 3, 4, 5])
  expect(positions('2.css', 1)).toEqual([1, 2, 3, 4, 5])
})

it('orders modules of an @import cycle between entries', () => {
  expect(positions('y.css', 0)).toEqual([1, 2])
  expect(positions('x.css', 1)).toEqual([1, 2])
})

it('orders modules of an @import cycle including the entry', () => {
  expect(positions('i.css', 0)).toEqual([1, 2, 3])
})
