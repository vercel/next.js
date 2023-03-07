import { SpanKind } from '@opentelemetry/api'

import { createNextDescribe } from 'e2e-utils'
import { check } from 'next-test-utils'

import { SavedSpan, traceFile } from './constants'

createNextDescribe(
  'opentelemetry',
  {
    files: __dirname,
    nextConfig: {
      experimental: {
        instrumentationHook: true,
      },
    },
    dependencies: {
      '@opentelemetry/api': '^1.0.0',
      '@opentelemetry/core': '^1.0.0',
      '@opentelemetry/resources': '^1.0.0',
      '@opentelemetry/sdk-trace-base': '^1.0.0',
      '@opentelemetry/sdk-trace-node': '^1.0.0',
      '@opentelemetry/semantic-conventions': '^1.0.0',
      'fs-extra': '^8.0.0',
      '@types/fs-extra': '^8.0.0',
    },
    env: {
      // NEXT_OTEL_VERBOSE: '1',
    },
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

    it('should exactly one root trace for each request with correct props', async () => {
      await next.fetch('/')

      const traces = await getTraces()
      const rootTraces = traces.filter((trace) => !trace.parentId)

      expect(rootTraces).toHaveLength(1)
      const rootTrace = rootTraces[0]

      expect(rootTrace.name).toBe('GET /')
      expect(rootTrace.kind).toBe(SpanKind.SERVER)
      expectSpanToHaveAttributes(rootTrace, {
        //HTTP: https://opentelemetry.io/docs/reference/specification/trace/semantic_conventions/http/
        'http.status_code': 200,
        'http.method': 'GET',
        'http.target': '/',
        'http.route': '/',
      })
    })

    it('should show correctly route with params', async () => {
      await next.fetch('/stuff')

      const traces = await getTraces()
      const rootTraces = traces.filter((trace) => !trace.parentId)

      expect(rootTraces).toHaveLength(1)
      const rootTrace = rootTraces[0]

      expect(rootTrace.name).toBe('GET /stuff')
      expectSpanToHaveAttributes(rootTrace, {
        'http.target': '/stuff',
        'http.route': '/stuff',
      })
    })
  }
)
