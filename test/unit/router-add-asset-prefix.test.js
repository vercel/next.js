/* eslint-env jest */
import { addAssetPrefix } from 'next/dist/next-server/lib/router/router'

describe('router addAssetPrefix', () => {
  it('should add the assetPrefix correctly when no assetPrefix exists', () => {
    const result = addAssetPrefix('/hello')
    expect(result).toBe('/hello')
  })
})
