import { createNextDescribe } from 'e2e-utils'
import { check, waitFor } from 'next-test-utils'

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

    beforeAll(async () => {
      await waitForOtelToInitialize()
    })

    afterEach(async () => {
      await cleanTraces()
    })

    // In case you need to test the response object
    it('should exactly one root trace for each request with correct props', async () => {
      await next.fetch('/')

      const traces = await getTraces()
      const rootTraces = traces.filter((trace) => !trace.parentId)

      expect(rootTraces).toHaveLength(1)
      const rootTrace = expect(rootTraces[0].name).toBe('GET /')
      expect(rootTraces[0].kind).toBe('SERVER')
    })

    it('should should provide all required properties for root trace', async () => {})
  }
)
