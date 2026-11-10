const { fileURLToPath } = require('url')
const fs = require('fs')

function expectSourceFileUrl(url) {
  expect(url).toMatch(/^file:\/\/\/.*\/import-meta\/cjs\/input\/mod\.cjs$/)
  expect(fs.existsSync(fileURLToPath(url))).toBe(true)
}

it('supports import.meta.url in a CommonJS module', () => {
  const { url } = require('./mod.cjs')
  expectSourceFileUrl(url)
})
