import { nextTestSetup } from 'e2e-utils'

// Skip for webpack - dpl suffix in asset URLs is only implemented for Turbopack
;(process.env.IS_TURBOPACK_TEST ? describe : describe.skip)(
  'URL asset references with deploymentId',
  () => {
    const { next, skipped } = nextTestSetup({
      files: __dirname,
      skipDeployment: true,
    })

    if (skipped) {
      return
    }

    const deploymentId = 'test-deployment-id'

    describe('import src attribute', () => {
      it('should include dpl query in RSC page', async () => {
        const $ = await next.render$('/')
        const src = $('#imported-src').text()
        expect(src).toContain('dpl=' + deploymentId)
      })

      it('should include dpl query in client page', async () => {
        const $ = await next.render$('/client')
        const src = $('#imported-src').text()
        expect(src).toContain('dpl=' + deploymentId)
      })
    })

    describe('new URL() pattern', () => {
      it('should include dpl query in RSC page', async () => {
        const $ = await next.render$('/')
        const url = $('#new-url').text()
        expect(url).toContain('dpl=' + deploymentId)
      })

      it('should include dpl query in client page', async () => {
        const $ = await next.render$('/client')
        const url = $('#new-url').text()
        expect(url).toContain('dpl=' + deploymentId)
      })
    })

    describe('API route', () => {
      it('should return import src with dpl query', async () => {
        const data = await next
          .fetch('/api')
          .then((res) => res.ok && res.json())
        expect(data.imported.src).toContain('dpl=' + deploymentId)
      })

      it('should return new URL with dpl query', async () => {
        const data = await next
          .fetch('/api')
          .then((res) => res.ok && res.json())
        expect(data.url).toContain('dpl=' + deploymentId)
      })
    })
  }
)
