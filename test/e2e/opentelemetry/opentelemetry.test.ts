import { SpanKind } from '@opentelemetry/api'

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

    const cleanTraces = async () => {
      await next.patchFile(traceFile, '')
    }

    const expectSpanToHaveAttributes = (
      span: SavedSpan,
      attributes: Record<string, any>
    ) => {
      Object.keys(attributes).forEach((key) => {
        expect({ [key]: span.attributes[key] }).toStrictEqual({
          [key]: attributes[key],
        })
      })
    }

    beforeAll(async () => {
      await waitForOtelToInitialize()
    })

    afterEach(async () => {
      await cleanTraces()
    })

    it('should have root server span with correct fields', async () => {
      await next.fetch('/pages')

      const traces = await getTraces()
      const rootTraces = traces.filter((trace) => !trace.parentId)

      expect(rootTraces).toHaveLength(1)
      const rootTrace = rootTraces[0]

      expect(rootTrace.name).toBe('GET /pages')
      expect(rootTrace.kind).toBe(SpanKind.SERVER)
      expectSpanToHaveAttributes(rootTrace, {
        //HTTP: https://opentelemetry.io/docs/reference/specification/trace/semantic_conventions/http/
        'http.status_code': 200,
        'http.method': 'GET',
        'http.target': '/pages',
      })
    })

    it('should should have root span with params', async () => {
      await next.fetch('/pages/params/stuff')

      const traces = await getTraces()
      const rootTraces = traces.filter((trace) => !trace.parentId)

      expect(rootTraces).toHaveLength(1)
      const rootTrace = rootTraces[0]

      expect(rootTrace.name).toBe('GET /pages/params/stuff')
      expectSpanToHaveAttributes(rootTrace, {
        'http.target': '/pages/params/stuff',
      })
    })

    it('should have rendering span', async () => {
      await next.fetch('/pages')

      const traces = await getTraces()
      expect(traces.map((span) => span.name)).toContain('rendering /pages')
    })

    it('should have fetch span', async () => {
      await next.fetch('/app/rsc-fetch')

      const traces = await getTraces()
      const fetchSpans = traces.filter((span) => span.name.startsWith('fetch'))

      expect(fetchSpans).toHaveLength(1)
      const fetchSpan = fetchSpans[0]

      expect(fetchSpan.name).toBe('fetch GET https://vercel.com/')
      expect(fetchSpan.kind).toBe(SpanKind.CLIENT)
      expectSpanToHaveAttributes(fetchSpan, {
        'http.method': 'GET',
        'net.peer.name': 'vercel.com',
      })
    })

    it('should have getServerSideProps span', async () => {
      await next.fetch('/pages/getServerSideProps')

      const traces = await getTraces()
      const gsspSpans = traces.filter((span) =>
        span.name.startsWith('getServerSideProps')
      )

      expect(gsspSpans).toHaveLength(1)
      const gsspSpan = gsspSpans[0]

      expect(gsspSpan.name).toBe('getServerSideProps /pages/getServerSideProps')
    })

    it('should have root span for api handlers in pages', async () => {
      await next.fetch('/api/pages/basic')

      const traces = await getTraces()
      const rootSpans = traces.filter((span) => !span.parentId)

      expect(rootSpans).toHaveLength(1)
      const rootSpan = rootSpans[0]

      expect(rootSpan.name).toBe('get /api/pages/basic')
    })
  }
)
