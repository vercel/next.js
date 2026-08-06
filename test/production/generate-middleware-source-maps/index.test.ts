import { nextTestSetup } from 'e2e-utils'
import fs from 'fs-extra'
import path from 'path'

function extractSourceMappingURL(jsContent) {
  // Matches both //# and //@ sourceMappingURL=...
  const match = jsContent.match(/\/\/[#@] sourceMappingURL=([^\s]+)/)
  expect(match).toBeDefined()
  return match ? match[1] : null
}

describe('Middleware source maps', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('generates a source map for Middleware', async () => {
    const middlewareManifest = await next.readJSON(
      '.next/server/middleware-manifest.json'
    )

    for (const key in middlewareManifest.middleware) {
      const middleware = middlewareManifest.middleware[key]
      expect(middleware.files).toBeDefined()
      for (const file of middleware.files) {
        const filePath = path.join(next.testDir, '.next', file)
        expect(await fs.pathExists(filePath)).toEqual(true)
        let sourcemap = decodeURI(
          extractSourceMappingURL(await fs.readFile(filePath, 'utf8'))
        )
        expect(
          await fs.pathExists(path.join(path.dirname(filePath), sourcemap))
        ).toEqual(true)
      }
    }
  })

  it('generates a source map for Edge API', async () => {
    const middlewareManifest = await next.readJSON(
      '.next/server/middleware-manifest.json'
    )
    for (const key in middlewareManifest.functions) {
      const edgeFunction = middlewareManifest.functions[key]
      expect(edgeFunction.files).toBeDefined()
      for (const file of edgeFunction.files.filter(
        (f) => f.includes('server/edge') || f.includes('server/pages')
      )) {
        const filePath = path.join(next.testDir, '.next', file)
        expect(await fs.pathExists(filePath)).toEqual(true)
        if (
          filePath.endsWith('.js') &&
          !filePath.endsWith('/react-loadable-manifest.js')
        ) {
          let sourcemap = decodeURI(
            extractSourceMappingURL(await fs.readFile(filePath, 'utf8'))
          )
          expect(
            await fs.pathExists(path.join(path.dirname(filePath), sourcemap))
          ).toEqual(true)
        }
      }
    }
  })
})
