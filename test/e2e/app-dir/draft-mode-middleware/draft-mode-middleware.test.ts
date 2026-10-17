import { join } from 'path'
import execa from 'execa'
import { FileRef, nextTestSetup } from 'e2e-utils'

const isProxy = process.env.TEST_DRAFT_MODE_PROXY === 'true'
const isNodeMiddleware = process.env.TEST_NODE_MIDDLEWARE === 'true'
const entrypoint = isProxy ? 'proxy' : 'middleware'
const runtime = isProxy || isNodeMiddleware ? 'nodejs' : 'edge'

describe(`app-dir - draft-mode-${entrypoint} (${runtime} runtime)`, () => {
  const { next } = nextTestSetup({
    files: {
      app: new FileRef(join(__dirname, 'app')),
      'invoke-handler.cjs': new FileRef(join(__dirname, 'invoke-handler.cjs')),
      'vercel.json': new FileRef(join(__dirname, 'vercel.json')),
      'middleware-edge.ts': new FileRef(join(__dirname, 'middleware-edge.ts')),
      [`${entrypoint}.ts`]: new FileRef(
        join(
          __dirname,
          isProxy
            ? 'proxy.ts'
            : isNodeMiddleware
              ? 'middleware-node.ts'
              : 'middleware-edge.ts'
        )
      ),
    },
    nextConfig: {
      distDir: 'custom-build',
    },
  })

  function getBypassCookie(response: Awaited<ReturnType<typeof next.fetch>>) {
    const cookie = response.headers
      .get('set-cookie')
      ?.match(/__prerender_bypass=[^;]+/)?.[0]
    expect(cookie).toBeTruthy()
    return cookie!
  }

  async function enableDraftMode() {
    const response = await next.fetch(
      '/api/draft?secret=secret-token&slug=preview-page',
      { redirect: 'manual' }
    )
    expect(response.status).toBe(307)
    return getBypassCookie(response)
  }

  it('should report disabled draft mode without a bypass cookie', async () => {
    const response = await next.fetch('/preview-page')
    expect(response.status).toBe(200)
    expect(response.headers.get('x-draft-mode')).toBe('disabled')
    expect(await response.text()).toContain('<h1>none</h1>')
  })

  it('should read draft mode enabled by a route handler', async () => {
    const cookie = await enableDraftMode()
    const response = await next.fetch('/preview-page', {
      headers: { cookie },
    })
    expect(response.status).toBe(200)
    expect(response.headers.get('x-draft-mode')).toBe('enabled')
    expect(await response.text()).toContain('<h1>draft</h1>')
  })

  it('should enable draft mode from middleware and preserve it on the next request', async () => {
    const response = await next.fetch('/preview-page?draft=true')
    expect(response.status).toBe(200)
    expect(response.headers.get('x-draft-mode')).toBe('enabled')

    const cookie = getBypassCookie(response)
    const nextResponse = await next.fetch('/preview-page', {
      headers: { cookie },
    })
    expect(nextResponse.headers.get('x-draft-mode')).toBe('enabled')
    expect(await nextResponse.text()).toContain('<h1>draft</h1>')
  })

  it('should disable draft mode from a route handler', async () => {
    const cookie = await enableDraftMode()
    const response = await next.fetch('/api/disable-draft', {
      headers: { cookie },
    })
    expect(response.status).toBe(200)
    expect(response.headers.get('set-cookie')).toContain('__prerender_bypass=;')

    const nextResponse = await next.fetch('/preview-page')
    expect(nextResponse.headers.get('x-draft-mode')).toBe('disabled')
    expect(await nextResponse.text()).toContain('<h1>none</h1>')
  })

  it('should disable draft mode from middleware', async () => {
    const cookie = await enableDraftMode()
    const response = await next.fetch('/preview-page?draft=false', {
      headers: { cookie },
    })
    expect(response.status).toBe(200)
    expect(response.headers.get('x-draft-mode')).toBe('disabled')
    expect(response.headers.get('set-cookie')).toContain('__prerender_bypass=;')

    const nextResponse = await next.fetch('/preview-page')
    expect(nextResponse.headers.get('x-draft-mode')).toBe('disabled')
    expect(await nextResponse.text()).toContain('<h1>none</h1>')
  })

  if (runtime === 'nodejs') {
    // Deploy runs cover the handler through HTTP above; this probe requires
    // the local build output that only exists in start mode.
    // @force-gate start
    it('should forward preview settings through the local standalone handler', async () => {
      await execa(process.execPath, ['invoke-handler.cjs'], {
        cwd: next.testDir,
      })
    })
  }
})
