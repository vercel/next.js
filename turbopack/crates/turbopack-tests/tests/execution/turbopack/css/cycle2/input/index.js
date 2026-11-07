const fs = require('fs')
const path = require('path')
const { fileURLToPath } = require('url')

// Not called, the chunks are only inspected.
export const load = [() => import('./1.css'), () => import('./2.css')]

// The execution harness writes the emitted CSS chunks to `output/`.
function readCssChunks() {
  const dir = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
    'output'
  )
  return fs
    .readdirSync(dir)
    .filter((file) => file.endsWith('.css'))
    .map((file) => fs.readFileSync(path.join(dir, file), 'utf8'))
}

// The source files of the modules in a CSS chunk, in order.
function cssSources(css) {
  return Array.from(
    css.matchAll(/\/\* \[project\]\/\S*\/input\/(\S+) \[test\] \(css/g),
    (match) => match[1]
  )
}

// Each rule's `content` lists its expected position in the chunk of each entry
// it is part of (`index` selects the entry).
function positions(entry, index) {
  const chunks = readCssChunks().filter(
    (css) => cssSources(css).at(-1) === entry
  )
  expect(chunks).toHaveLength(1)
  return Array.from(chunks[0].matchAll(/content: (["'])(.*?)\1/g), (match) =>
    Number(match[2].split(' ')[index])
  )
}

it('orders modules of an @import cycle reached from several imports', () => {
  expect(positions('1.css', 0)).toEqual([1, 2, 3, 4, 5, 6, 7])
  expect(positions('2.css', 1)).toEqual([1, 2, 3, 4, 5, 6, 7])
})
