import img from './vercel.svg'

const fs = require('fs')
const path = require('path')
const { fileURLToPath } = require('url')

it('exports the content-hashed URL of an imported static asset', () => {
  expect(img).toMatch(/^\/vercel\.[\w-]+\.svg$/)
})

it('emits the imported static asset', () => {
  // The execution harness writes static assets to `output/static/`, which is the root the
  // asset URL is relative to.
  const inputDir = path.dirname(fileURLToPath(import.meta.url))
  const emitted = path.join(inputDir, '..', 'output', 'static', img)
  expect(fs.readFileSync(emitted, 'utf8')).toBe(
    fs.readFileSync(path.join(inputDir, 'vercel.svg'), 'utf8')
  )
})
