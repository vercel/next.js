// Helpers to inspect the CSS chunks a test emits. The execution harness writes them to the
// test's `output/` directory, which is cleaned before each run.

const fs = require('fs')
const path = require('path')
const { fileURLToPath } = require('url')

/**
 * The contents of all CSS chunks emitted by the test whose `import.meta.url` is `testUrl`.
 */
export function readCssChunks(testUrl) {
  const dir = path.join(path.dirname(fileURLToPath(testUrl)), '..', 'output')
  return fs
    .readdirSync(dir)
    .filter((file) => file.endsWith('.css'))
    .map((file) => fs.readFileSync(path.join(dir, file), 'utf8'))
}

/**
 * The source files (relative to the test's `input/` directory) of the modules in a CSS chunk, in
 * order.
 */
export function cssSources(css) {
  return Array.from(
    css.matchAll(/\/\* \[project\]\/\S*\/input\/(\S+) \[test\] \(css/g),
    (match) => match[1]
  )
}

/**
 * Like `cssSources`, but each source is followed by the module's type and the import attributes
 * it was imported with, e.g. `c.css (css, layer(foo) print)`.
 */
export function cssSourcesWithAttributes(css) {
  return Array.from(
    css.matchAll(
      /\/\* \[project\]\/\S*\/input\/(\S+) \[test\] \((.*?)\) \*\//g
    ),
    (match) => `${match[1]} (${match[2]})`
  )
}
