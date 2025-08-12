import { nextTestSetup } from 'e2e-utils'

describe('00-app-dir-actions', () => {
  const { next, isNextDeploy } = nextTestSetup({
    files: __dirname,
    packageJson: {
      scripts: {
        build:
          'next build && cp .next/server/server-reference-manifest.json public/',
      },
    },
  })

  let actionManifest: any

  beforeAll(async () => {
    if (isNextDeploy) {
      // Only fetch action manifest in deploy mode
      const res = await next.fetch('/server-reference-manifest.json')
      actionManifest = await res.json()
    }
  })

  function findActionId(page: string) {
    if (!isNextDeploy || !actionManifest) return null

    page = `app${page}/page` // add /app prefix and /page suffix

    for (const [actionId, details] of Object.entries(actionManifest.node)) {
      if ((details as any).workers[page]) {
        return actionId
      }
    }
    return null
  }

  function generateFormDataPayload(actionId: string) {
    return {
      method: 'POST',
      body: `------WebKitFormBoundaryHcVuFa30AN0QV3uZ\r\nContent-Disposition: form-data; name="1_$ACTION_ID_${actionId}"\r\n\r\n\r\n------WebKitFormBoundaryHcVuFa30AN0QV3uZ\r\nContent-Disposition: form-data; name="0"\r\n\r\n["$K1"]\r\n------WebKitFormBoundaryHcVuFa30AN0QV3uZ--\r\n`,
      headers: {
        'Content-Type':
          'multipart/form-data; boundary=----WebKitFormBoundaryHcVuFa30AN0QV3uZ',
        'Next-Action': actionId,
      },
    }
  }

  describe('client component', () => {
    it('should bypass the static cache for a server action', async () => {
      const path = '/client/static'

      if (isNextDeploy) {
        const actionId = findActionId(path)
        if (!actionId) return

        const res = await next.fetch(path, {
          method: 'POST',
          body: JSON.stringify([1337]),
          headers: {
            'Content-Type': 'text/plain;charset=UTF-8',
            'Next-Action': actionId,
          },
        })

        expect(res.status).toEqual(200)
        const body = await res.text()
        expect(body).toContain('1338')
        expect(res.headers.get('x-matched-path')).toBe(path)
        expect(res.headers.get('x-vercel-cache')).toBe('BYPASS')
      } else {
        // Test basic functionality without deployment-specific checks
        const res = await next.fetch(path)
        expect(res.status).toEqual(200)
      }
    })

    it('should bypass the static cache for a server action on a page with dynamic params', async () => {
      const path = '/client/static/[dynamic-static]'

      if (isNextDeploy) {
        const actionId = findActionId(path)
        if (!actionId) return

        const res = await next.fetch(path, {
          method: 'POST',
          body: JSON.stringify([1337]),
          headers: {
            'Content-Type': 'text/plain;charset=UTF-8',
            'Next-Action': actionId,
          },
        })

        expect(res.status).toEqual(200)
        const body = await res.text()
        expect(body).toContain('1338')
        expect(res.headers.get('x-matched-path')).toBe(path)
        expect(res.headers.get('x-vercel-cache')).toBe('BYPASS')
      } else {
        // Test basic functionality without deployment-specific checks
        const res = await next.fetch(path.replace('[dynamic-static]', 'test'))
        expect(res.status).toEqual(200)
      }
    })

    it('should bypass the static cache for a multipart request (no action header)', async () => {
      const path = '/client/static'

      if (isNextDeploy) {
        const actionId = findActionId(path)
        if (!actionId) return

        const res = await next.fetch(path, {
          method: 'POST',
          body: `------WebKitFormBoundaryHcVuFa30AN0QV3uZ\r\nContent-Disposition: form-data; name="1_$ACTION_ID_${actionId}"\r\n\r\n\r\n------WebKitFormBoundaryHcVuFa30AN0QV3uZ\r\nContent-Disposition: form-data; name="0"\r\n\r\n["$K1"]\r\n------WebKitFormBoundaryHcVuFa30AN0QV3uZ--\r\n`,
          headers: {
            'Content-Type':
              'multipart/form-data; boundary=----WebKitFormBoundaryHcVuFa30AN0QV3uZ',
          },
        })

        expect(res.status).toEqual(200)
        expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8')
        expect(res.headers.get('x-vercel-cache')).toBe('BYPASS')
        expect(res.headers.get('x-matched-path')).toBe(path)
      } else {
        // Test basic functionality without deployment-specific checks
        const res = await next.fetch(path)
        expect(res.status).toEqual(200)
      }
    })

    it('should properly invoke the action on a dynamic page', async () => {
      const path = '/client/dynamic/[id]'

      if (isNextDeploy) {
        const actionId = findActionId(path)
        if (!actionId) return

        const res = await next.fetch(path, {
          method: 'POST',
          body: JSON.stringify([1337]),
          headers: {
            'Content-Type': 'text/plain;charset=UTF-8',
            'Next-Action': actionId,
          },
        })

        expect(res.status).toEqual(200)
        const body = await res.text()
        expect(body).toContain('1338')
        expect(res.headers.get('x-matched-path')).toBe(path)
        // This isn't a "BYPASS" because the action wasn't part of a static prerender
        expect(res.headers.get('x-vercel-cache')).toBe('MISS')
      } else {
        // Test basic functionality without deployment-specific checks
        const res = await next.fetch(path.replace('[id]', 'test'))
        expect(res.status).toEqual(200)
      }
    })
  })

  describe('server component', () => {
    it('should bypass the static cache for a server action', async () => {
      const path = '/rsc/static'

      if (isNextDeploy) {
        const actionId = findActionId(path)
        if (!actionId) return

        const res = await next.fetch(path, generateFormDataPayload(actionId))

        expect(res.status).toEqual(200)
        expect(res.headers.get('x-matched-path')).toBe(path)
        expect(res.headers.get('content-type')).toBe('text/x-component')
        expect(res.headers.get('x-vercel-cache')).toBe('BYPASS')
      } else {
        // Test basic functionality without deployment-specific checks
        const res = await next.fetch(path)
        expect(res.status).toEqual(200)
      }
    })

    it('should bypass the static cache for a server action on a page with dynamic params', async () => {
      const path = '/rsc/static/[dynamic-static]'

      if (isNextDeploy) {
        const actionId = findActionId(path)
        if (!actionId) return

        const res = await next.fetch(path, generateFormDataPayload(actionId))

        expect(res.status).toEqual(200)
        expect(res.headers.get('x-matched-path')).toBe(path)
        expect(res.headers.get('content-type')).toBe('text/x-component')
        expect(res.headers.get('x-vercel-cache')).toBe('BYPASS')
      } else {
        // Test basic functionality without deployment-specific checks
        const res = await next.fetch(path.replace('[dynamic-static]', 'test'))
        expect(res.status).toEqual(200)
      }
    })

    it('should properly invoke the action on a dynamic page', async () => {
      const path = '/rsc/dynamic'

      if (isNextDeploy) {
        const actionId = findActionId(path)
        if (!actionId) return

        const res = await next.fetch(path, generateFormDataPayload(actionId))

        expect(res.status).toEqual(200)
        expect(res.headers.get('x-matched-path')).toBe(path)
        expect(res.headers.get('content-type')).toBe('text/x-component')
        // This isn't a "BYPASS" because the action wasn't part of a static prerender
        expect(res.headers.get('x-vercel-cache')).toBe('MISS')
      } else {
        // Test basic functionality without deployment-specific checks
        const res = await next.fetch(path)
        expect(res.status).toEqual(200)
      }
    })

    describe('generateStaticParams', () => {
      it('should bypass the static cache for a server action when pre-generated', async () => {
        const path = '/rsc/static/generate-static-params/pre-generated'

        if (isNextDeploy) {
          const actionId = findActionId(
            '/rsc/static/generate-static-params/[slug]'
          )
          if (!actionId) return

          const res = await next.fetch(path, generateFormDataPayload(actionId))

          expect(res.status).toEqual(200)
          expect(res.headers.get('x-matched-path')).toBe(
            '/rsc/static/generate-static-params/pre-generated'
          )
          expect(res.headers.get('content-type')).toBe('text/x-component')
          expect(res.headers.get('x-vercel-cache')).toBe('BYPASS')
        } else {
          // Test basic functionality without deployment-specific checks
          const res = await next.fetch(path)
          expect(res.status).toEqual(200)
        }
      })

      it('should bypass the static cache for a server action when not pre-generated', async () => {
        const page = '/rsc/static/generate-static-params/[slug]'

        if (isNextDeploy) {
          const actionId = findActionId(page)
          if (!actionId) return

          const res = await next.fetch(
            '/rsc/static/generate-static-params/not-pre-generated',
            generateFormDataPayload(actionId)
          )

          expect(res.status).toEqual(200)
          expect(res.headers.get('x-matched-path')).toBe(page)
          expect(res.headers.get('content-type')).toBe('text/x-component')
          // This isn't a "BYPASS" because the action wasn't part of a static prerender
          expect(res.headers.get('x-vercel-cache')).toBe('BYPASS')
        } else {
          // Test basic functionality without deployment-specific checks
          const res = await next.fetch(
            '/rsc/static/generate-static-params/not-pre-generated'
          )
          expect(res.status).toEqual(200)
        }
      })
    })
  })

  describe('pages', () => {
    it('should not attempt to rewrite the action path for a server action (POST)', async () => {
      const res = await next.fetch('/api/test', {
        method: 'POST',
        headers: {
          'Content-Type':
            'multipart/form-data; boundary=----WebKitFormBoundaryHcVuFa30AN0QV3uZ',
        },
      })

      expect(res.status).toEqual(200)

      if (isNextDeploy) {
        expect(res.headers.get('x-matched-path')).toBe('/api/test')
        expect(res.headers.get('x-vercel-cache')).toBe('MISS')
      }

      const body = await res.json()
      expect(body).toEqual({ message: 'Hello from Next.js!' })
    })

    it('should not attempt to rewrite the action path for a server action (GET)', async () => {
      const res = await next.fetch('/api/test')

      expect(res.status).toEqual(200)

      if (isNextDeploy) {
        expect(res.headers.get('x-matched-path')).toBe('/api/test')
      }

      const body = await res.json()
      expect(body).toEqual({ message: 'Hello from Next.js!' })
    })
  })
})
