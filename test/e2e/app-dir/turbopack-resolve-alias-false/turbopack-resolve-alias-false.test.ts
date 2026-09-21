import { nextTestSetup } from 'e2e-utils'

describe('resolve-alias-false', () => {
  const isTurbopack = Boolean(process.env.IS_TURBOPACK_TEST)
  const { next } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  describe('ESM static imports', () => {
    it('resolves namespace import (import * as ns) to {}', async () => {
      const response = JSON.parse(await next.render('/api/esm'))
      expect(response.namespaceImport).toEqual({})
    })

    it('resolves named import (import { foo }) to undefined', async () => {
      const response = JSON.parse(await next.render('/api/esm'))
      expect(response.namedImportIsUndefined).toBe(true)
    })

    it('uses bundler-specific default import interop', async () => {
      const response = JSON.parse(await next.render('/api/esm'))
      expect(response.defaultImportIsUndefined).toBe(isTurbopack)
    })
  })

  describe('dynamic import()', () => {
    it('uses bundler-specific dynamic import interop', async () => {
      const response = JSON.parse(await next.render('/api/dynamic'))
      expect(response.dynamicImport).toEqual(isTurbopack ? {} : { default: {} })
    })
  })

  describe('CommonJS require()', () => {
    it('resolves require() to {}', async () => {
      const response = JSON.parse(await next.render('/api/cjs'))
      expect(response.required).toEqual({})
    })
  })
})
