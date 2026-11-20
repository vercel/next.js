import meta from './mod.mjs'

const { fileURLToPath } = require('url')
const fs = require('fs')

function expectSourceFileUrl(url) {
  expect(url).toMatch(
    /^file:\/\/\/.*\/import-meta\/esm-object\/input\/mod\.mjs$/
  )
  expect(fs.existsSync(fileURLToPath(url))).toBe(true)
}

it('supports using the import.meta object as a value', () => {
  expect(typeof meta).toBe('object')
  expectSourceFileUrl(meta.url)
  expect(meta.env).toEqual(
    expect.objectContaining({ MODE: 'production', BASE_URL: '/' })
  )
})
