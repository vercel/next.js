import { createNextDescribe } from 'e2e-utils'
import { check } from 'next-test-utils'

import { SavedSpan, traceFile } from './constants'

createNextDescribe(
  'opentelemetry',
  {
    files: __dirname,
    packageJson: require('./package.json'),
  },
  ({ next }) => {
    const getTraces = async (): Promise<SavedSpan[]> => {
      const traces = await next.readFile(traceFile)
      return traces
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line))
    }

    /** There were issues where OTEL might not be initialized for first few requests (this is a bug).
     * It made our tests, flaky. This should make tests deterministic.
     */
    const waitForOtelToInitialize = async () => {
      await check(
        async () =>
          await next
            .readFile(traceFile)
            .then(() => 'ok')
            .catch(() => 'err'),
        'ok'
      )
    }

    const waitForRootSpan = async (numberOfRootTraces: number) => {
      await check(async () => {
        const spans = await getTraces()
        const rootSpans = spans.filter((span) => !span.parentId)
        return String(rootSpans.length)
      }, String(numberOfRootTraces))
    }

    /**
     * Sanitize (modifies) span to make it ready for snapshot testing.
     */
    const sanitizeSpan = (span: SavedSpan) => {
      delete span.duration
      delete span.id
      delete span.links
      delete span.events
      delete span.timestamp
      delete span.traceId
      span.parentId = span.parentId === undefined ? undefined : '[parent-id]'
      return span
    }
    const sanitizeSpans = (spans: SavedSpan[]) =>
      spans.sort((a, b) => a.name.localeCompare(b.name)).map(sanitizeSpan)

    const getSanitizedTraces = async (numberOfRootTraces: number) => {
      await waitForRootSpan(numberOfRootTraces)
      return sanitizeSpans(await getTraces())
    }

    const cleanTraces = async () => {
      await next.patchFile(traceFile, '')
    }

    beforeAll(async () => {
      await waitForOtelToInitialize()
    })

    afterEach(async () => {
      await cleanTraces()
    })

    it('should have spans when accessing page', async () => {
      await next.fetch('/pages')

      expect(await getSanitizedTraces(1)).toMatchInlineSnapshot(`
        Array [
          Object {
            "attributes": Object {
              "http.method": "GET",
              "http.status_code": 200,
              "http.target": "/pages",
            },
            "kind": 1,
            "name": "GET /pages",
            "parentId": undefined,
            "status": Object {
              "code": 0,
            },
          },
          Object {
            "attributes": Object {
              "next.pathname": "/pages",
            },
            "kind": 0,
            "name": "rendering /pages",
            "parentId": "[parent-id]",
            "status": Object {
              "code": 0,
            },
          },
          Object {
            "attributes": Object {
              "next.route": "/pages",
            },
            "kind": 0,
            "name": "resolving route /pages",
            "parentId": "[parent-id]",
            "status": Object {
              "code": 0,
            },
          },
        ]
      `)
    })

    it('should handle route params', async () => {
      await next.fetch('/pages/params/stuff')

      expect(await getSanitizedTraces(1)).toMatchInlineSnapshot(`
        Array [
          Object {
            "attributes": Object {
              "http.method": "GET",
              "http.status_code": 200,
              "http.target": "/pages/params/stuff",
            },
            "kind": 1,
            "name": "GET /pages/params/stuff",
            "parentId": undefined,
            "status": Object {
              "code": 0,
            },
          },
          Object {
            "attributes": Object {
              "next.pathname": "/pages/params/stuff",
            },
            "kind": 0,
            "name": "rendering /pages/params/stuff",
            "parentId": "[parent-id]",
            "status": Object {
              "code": 0,
            },
          },
          Object {
            "attributes": Object {
              "next.route": "/pages/params/[param]",
            },
            "kind": 0,
            "name": "resolving route /pages/params/[param]",
            "parentId": "[parent-id]",
            "status": Object {
              "code": 0,
            },
          },
        ]
      `)
    })

    it('should handle RSC with fetch', async () => {
      await next.fetch('/app/rsc-fetch')

      expect(await getSanitizedTraces(1)).toMatchInlineSnapshot(`
        Array [
          Object {
            "attributes": Object {},
            "kind": 2,
            "name": "AppRender.fetch",
            "parentId": "[parent-id]",
            "status": Object {
              "code": 2,
              "message": "Request cannot be constructed from a URL that includes credentials: https://user:pass@vercel.com",
            },
          },
          Object {
            "attributes": Object {
              "http.method": "GET",
              "http.status_code": 200,
              "http.target": "/app/rsc-fetch",
            },
            "kind": 1,
            "name": "GET /app/rsc-fetch",
            "parentId": undefined,
            "status": Object {
              "code": 0,
            },
          },
          Object {
            "attributes": Object {
              "next.pathname": "/app/rsc-fetch",
            },
            "kind": 0,
            "name": "rendering /app/rsc-fetch",
            "parentId": "[parent-id]",
            "status": Object {
              "code": 0,
            },
          },
          Object {
            "attributes": Object {
              "next.route": "/app/rsc-fetch/page",
            },
            "kind": 0,
            "name": "resolving route /app/rsc-fetch/page",
            "parentId": "[parent-id]",
            "status": Object {
              "code": 0,
            },
          },
        ]
      `)
    })

    it('should handle getServerSideProps', async () => {
      await next.fetch('/pages/getServerSideProps')

      expect(await getSanitizedTraces(1)).toMatchInlineSnapshot(`
        Array [
          Object {
            "attributes": Object {
              "http.method": "GET",
              "http.status_code": 200,
              "http.target": "/pages/getServerSideProps",
            },
            "kind": 1,
            "name": "GET /pages/getServerSideProps",
            "parentId": undefined,
            "status": Object {
              "code": 0,
            },
          },
          Object {
            "attributes": Object {},
            "kind": 0,
            "name": "getServerSideProps /pages/getServerSideProps",
            "parentId": "[parent-id]",
            "status": Object {
              "code": 0,
            },
          },
          Object {
            "attributes": Object {
              "next.pathname": "/pages/getServerSideProps",
            },
            "kind": 0,
            "name": "rendering /pages/getServerSideProps",
            "parentId": "[parent-id]",
            "status": Object {
              "code": 0,
            },
          },
          Object {
            "attributes": Object {
              "next.route": "/pages/getServerSideProps",
            },
            "kind": 0,
            "name": "resolving route /pages/getServerSideProps",
            "parentId": "[parent-id]",
            "status": Object {
              "code": 0,
            },
          },
        ]
      `)
    })

    it('should handle route handlers in app router', async () => {
      await next.fetch('/api/pages/basic')

      expect(await getSanitizedTraces(1)).toMatchInlineSnapshot(`
        Array [
          Object {
            "attributes": Object {
              "http.method": "GET",
              "http.status_code": 200,
              "http.target": "/api/pages/basic",
            },
            "kind": 1,
            "name": "GET /api/pages/basic",
            "parentId": undefined,
            "status": Object {
              "code": 0,
            },
          },
        ]
      `)
    })
  }
)
