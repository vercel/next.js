import fs from 'fs'
import { nextTestSetup } from 'e2e-utils'
import type { NextAdapter } from 'next'
import { AdapterOutputType } from 'next/constants'

describe('adapter-config', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should apply modifyConfig from adapter', async () => {
    // we apply basePath of "/docs" to ensure modify was called
    const res = await next.fetch('/')
    expect(res.status).toBe(404)

    const res2 = await next.fetch('/docs/node-pages')
    expect(res2.status).toBe(200)
    expect(await res2.text()).toContain('hello world')

    expect(next.cliOutput).toContain('called modify config in adapter')
  })

  it('should call onBuildComplete with correct context', async () => {
    expect(next.cliOutput).toContain('onBuildComplete called')

    const buildContext: Parameters<NextAdapter['onBuildComplete']>[0] =
      await next.readJSON('build-complete.json')

    const outputMap = new Map<string, (typeof buildContext.outputs)[0]>()
    const prerenderOutputs: typeof buildContext.outputs = []
    const staticOutputs: typeof buildContext.outputs = []
    const nodeOutputs: typeof buildContext.outputs = []
    const edgeOutputs: typeof buildContext.outputs = []

    for (const output of buildContext.outputs) {
      if (outputMap.has(output.id)) {
        throw new Error(
          `multiple outputs with same ID ${JSON.stringify(
            {
              first: outputMap.get(output.id),
              second: output,
            },
            null,
            2
          )}`
        )
      }

      switch (output.type) {
        case AdapterOutputType.PRERENDER: {
          prerenderOutputs.push(output)
          break
        }
        case AdapterOutputType.STATIC_FILE: {
          staticOutputs.push(output)
          break
        }
        case AdapterOutputType.APP_PAGE:
        case AdapterOutputType.APP_ROUTE:
        case AdapterOutputType.PAGES:
        case AdapterOutputType.PAGES_API: {
          if (output.runtime === 'nodejs') {
            nodeOutputs.push(output)
          } else if (output.runtime === 'edge') {
            edgeOutputs.push(output)
          } else {
            throw new Error(
              `unrecognized runtime on ${JSON.stringify(output, null, 2)}`
            )
          }
          break
        }
        default: {
          throw new Error(`unrecognized output type ${output.type}`)
        }
      }
    }

    expect(nodeOutputs.length).toBeGreaterThan(0)
    expect(edgeOutputs.length).toBeGreaterThan(0)
    expect(staticOutputs.length).toBeGreaterThan(0)
    expect(prerenderOutputs.length).toBeGreaterThan(0)

    for (const output of staticOutputs) {
      expect(output.id).toBeTruthy()
      expect(output.pathname).toStartWith('/_next/static')
      expect(fs.existsSync(output.filePath)).toBe(true)
    }

    for (const prerenderOutput of prerenderOutputs) {
      try {
        expect(prerenderOutput.parentOutputId).toBeTruthy()
        if (prerenderOutput.fallback) {
          expect(await fs.existsSync(prerenderOutput.fallback.filePath)).toBe(
            true
          )
          expect(prerenderOutput.fallback.initialRevalidate).toBeDefined()
        }

        expect(typeof prerenderOutput.config.bypassToken).toBe('string')
        expect(Array.isArray(prerenderOutput.config.allowHeader)).toBe(true)
        expect(Array.isArray(prerenderOutput.config.allowQuery)).toBe(true)
      } catch (err) {
        require('console').error(`invalid prerender ${prerenderOutput.id}`, err)
        throw err
      }
    }

    expect(buildContext.routes).toEqual({
      dynamicRoutes: expect.toBeArray(),
      rewrites: expect.toBeObject(),
      redirects: expect.toBeArray(),
      headers: expect.toBeArray(),
    })
  })
})
