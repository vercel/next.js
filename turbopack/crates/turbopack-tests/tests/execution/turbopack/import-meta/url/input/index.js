import { assetUrl } from './mod.mjs'

it('resolves a new URL() relative to import.meta.url to an asset', () => {
  expect(assetUrl).toBeInstanceOf(URL)
  expect(assetUrl.pathname).toMatch(/\/asset\.[\w-]+\.txt$/)
  expect(assetUrl.toString()).not.toContain('/input/asset.txt')
})
