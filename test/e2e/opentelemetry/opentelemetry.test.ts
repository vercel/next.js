import { createNextDescribe } from 'e2e-utils'

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
      NEXT_OTEL_VERBOSE: '1',
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

    // In case you need to test the response object
    it('it will emit trace when we load /', async () => {
      await next.fetch('/')

      const traces = await getTraces()
      expect(
        traces.filter((trace) => trace.name === 'get /')
      ).toMatchInlineSnapshot(`Array []`)
      console.log(traces)
    })
  }
)
