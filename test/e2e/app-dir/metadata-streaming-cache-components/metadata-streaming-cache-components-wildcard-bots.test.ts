import { isNextDev, nextTestSetup } from 'e2e-utils'
;(isNextDev ? describe.skip : describe)(
  'metadata streaming with Cache Components and a wildcard bot list',
  () => {
    const { next, isNextDeploy } = nextTestSetup({
      files: __dirname,
      overrideFiles: {
        'next.config.js': `
          module.exports = {
            cacheComponents: true,
            htmlLimitedBots: /.*/,
          }
        `,
      },
    })

    it.each(['MyBrowser', 'Googlebot'])(
      'should block metadata while continuing to stream the body for %s',
      async (userAgent) => {
        const abortController = new AbortController()
        let body:
          | (AsyncIterable<Uint8Array> & {
              cancel: () => void
            })
          | undefined

        try {
          const res = await next.fetch('/partial?stream=1', {
            headers: {
              'user-agent': userAgent,
            },
            signal: abortController.signal,
          })

          expect(res.status).toBe(200)
          if (!isNextDeploy) {
            expect(res.headers.get('x-nextjs-postponed')).toBeNull()
          }
          expect(res.body).not.toBeNull()

          body = res.body! as unknown as AsyncIterable<Uint8Array> & {
            cancel: () => void
          }
          let initialHtml = ''

          for await (const chunk of body) {
            initialHtml += Buffer.from(chunk).toString()
            if (initialHtml.includes('dynamic-fallback')) {
              break
            }
          }

          expect(initialHtml).toContain('<title>dynamic title</title>')
          expect(initialHtml).toContain('dynamic-fallback')
          expect(initialHtml).not.toContain('dynamic-content')
        } finally {
          abortController.abort()
          body?.cancel()
        }
      }
    )
  }
)
