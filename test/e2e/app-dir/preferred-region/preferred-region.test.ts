import { nextTestSetup } from 'e2e-utils'

describe('preferred-region', () => {
  const { next, isNextStart } = nextTestSetup({
    files: __dirname,
  })

  it('should return success from Node.js API route', async () => {
    const res = await next.fetch('/api/test')
    expect(res.status).toBe(200)

    const data = await res.json()
    expect(data).toEqual({ status: 'success' })
  })

  it('should return success from Edge API route', async () => {
    const res = await next.fetch('/api/test-edge')
    expect(res.status).toBe(200)

    const data = await res.json()
    expect(data).toEqual({ status: 'success', runtime: 'edge' })
  })

  it('should include preferredRegion in functions config manifest for nodejs runtime', async () => {
    if (isNextStart) {
      let functionsConfigManifest
      let middlewareManifest

      try {
        // Check Functions Config Manifest (for Node.js runtime)
        functionsConfigManifest = JSON.parse(
          await next.readFile('.next/server/functions-config-manifest.json')
        )

        // Check Middleware Manifest (for Edge runtime)
        middlewareManifest = JSON.parse(
          await next.readFile('.next/server/middleware-manifest.json')
        )
      } catch (error) {
        console.error('Error reading manifests:', error)
        throw error
      }

      // Test our fix: Node.js route should have both maxDuration and regions
      expect(functionsConfigManifest.functions).toHaveProperty('/api/test')
      expect(functionsConfigManifest.functions['/api/test']).toHaveProperty(
        'maxDuration',
        100
      )
      expect(functionsConfigManifest.functions['/api/test']).toHaveProperty(
        'regions'
      )
      expect(functionsConfigManifest.functions['/api/test'].regions).toEqual([
        'iad1',
      ])

      // Edge route should also be in functions manifest with regions
      expect(functionsConfigManifest.functions).toHaveProperty('/api/test-edge')
      expect(
        functionsConfigManifest.functions['/api/test-edge']
      ).toHaveProperty('maxDuration', 100)
      expect(
        functionsConfigManifest.functions['/api/test-edge']
      ).toHaveProperty('regions')
      expect(
        functionsConfigManifest.functions['/api/test-edge'].regions
      ).toEqual(['iad1'])

      // Edge runtime should also work correctly in middleware manifest - check for regions only
      const edgeRoutePath = '/api/test-edge/route'
      expect(middlewareManifest.functions).toHaveProperty(edgeRoutePath)
      expect(middlewareManifest.functions[edgeRoutePath]).toHaveProperty(
        'regions'
      )
      expect(middlewareManifest.functions[edgeRoutePath].regions).toEqual([
        'iad1',
      ])
    }
  })
})
