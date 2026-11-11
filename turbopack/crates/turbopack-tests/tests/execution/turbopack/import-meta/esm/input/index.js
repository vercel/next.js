import { url } from './mod.mjs'

const { fileURLToPath } = require('url')
const fs = require('fs')

function expectSourceFileUrl(url) {
  expect(url).toMatch(/^file:\/\/\/.*\/import-meta\/esm\/input\/mod\.mjs$/)
  expect(fs.existsSync(fileURLToPath(url))).toBe(true)
}

it('supports import.meta.url in an ESM module', () => {
  expectSourceFileUrl(url)
})
