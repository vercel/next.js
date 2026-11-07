import style from './style.module.css'
import './style.css'

const fs = require('fs')
const path = require('path')
const { fileURLToPath } = require('url')

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

// The declarations of the first rule for `selector`.
function declarations(css, selector) {
  const start = css.indexOf(`${selector} {`)
  expect(start).toBeGreaterThanOrEqual(0)
  return css.slice(start, css.indexOf('}', start))
}

const ASSET_URL = /url\("\.\.\/static\/image\.[\w-]+\.png"\)/g

it('rewrites url() references in CSS to the emitted asset', () => {
  const css = readCssChunks().join('\n')
  const urls = declarations(css, '.style').match(ASSET_URL)
  // `./image.png`, `image.png` and `'image.png'` all resolve to the same asset.
  expect(urls).toHaveLength(3)
  expect(new Set(urls).size).toBe(1)
})

it('rewrites url() references in CSS modules to the emitted asset', () => {
  const css = readCssChunks().join('\n')
  expect(
    declarations(css, `.${style['module-style']}`).match(ASSET_URL)
  ).toHaveLength(3)
})

it('keeps unresolvable url() references unchanged', () => {
  // The resolve errors are reported as issues (see `issues/`).
  const css = readCssChunks().join('\n')
  const unresolvable = declarations(css, '.style-unresolveable')
  expect(unresolvable).toContain('url("./missing1.png")')
  expect(unresolvable).toContain('url("missing2.png")')
  expect(unresolvable).toContain('url("missing3.png")')
})
