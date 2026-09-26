import { FileRef, isNextDev, nextTestSetup } from 'e2e-utils'
import { join } from 'path'

// An on-demand ISR page keeps its Cache-Control, and is not treated as stale
// after one second, when the process serving the cached entry is not the one
// that rendered the page: a restarted server, or another instance sharing the
// cache.
function runTests(setup: Parameters<typeof nextTestSetup>[0]) {
  const { next, skipped } = nextTestSetup(setup)
  if (skipped) return

  it('keeps the Cache-Control of an on-demand ISR page after a restart', async () => {
    const rendered = await next.fetch('/1')
    expect(rendered.status).toBe(200)
    expect(rendered.headers.get('x-nextjs-cache')).toBe('MISS')
    const cacheControl = rendered.headers.get('cache-control')
    expect(cacheControl).toContain('s-maxage=3600')

    await next.stop()
    await next.start({ skipBuild: true })

    const cached = await next.fetch('/1')
    expect(cached.status).toBe(200)
    expect(cached.headers.get('x-nextjs-cache')).toBe('HIT')
    expect(cached.headers.get('cache-control')).toBe(cacheControl)
  })
}

;(isNextDev ? describe.skip : describe)('isr-cache-control-restart', () => {
  describe('default cache', () => {
    runTests({ files: __dirname, skipDeployment: true })
  })

  describe('custom cache handler that stores cacheControl', () => {
    runTests({
      files: {
        app: new FileRef(join(__dirname, 'app')),
        'cache-handler.js': new FileRef(join(__dirname, 'cache-handler.js')),
        'next.config.js': `module.exports = { cacheHandler: require.resolve('./cache-handler.js'), cacheMaxMemorySize: 0 }`,
      },
      skipDeployment: true,
    })
  })
})
