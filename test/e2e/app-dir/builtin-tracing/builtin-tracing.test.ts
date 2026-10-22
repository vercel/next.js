import { FileRef, nextTestSetup } from 'e2e-utils'
import { join } from 'path'

// `@vercel/otel` and its peer dependencies.
const OTEL_DEPENDENCIES = {
  '@vercel/otel': '2.1.3',
  '@opentelemetry/api': '1.9.1',
  '@opentelemetry/api-logs': '0.223.0',
  '@opentelemetry/instrumentation': '0.223.0',
  '@opentelemetry/resources': '2.12.0',
  '@opentelemetry/sdk-logs': '0.223.0',
  '@opentelemetry/sdk-metrics': '2.12.0',
  '@opentelemetry/sdk-trace-base': '2.12.0',
}

function fixture(config: 'tracing' | 'omitted', extra = {}) {
  return {
    app: new FileRef(join(__dirname, 'app')),
    'middleware.ts': new FileRef(join(__dirname, 'middleware.ts')),
    'next.config.ts': new FileRef(
      join(__dirname, 'fixtures', config, 'next.config.ts')
    ),
    ...extra,
  }
}

async function probe(
  next: ReturnType<typeof nextTestSetup>['next'],
  runtime: 'node' | 'edge'
) {
  const res = await next.fetch(`/${runtime}`)
  expect(res.status).toBe(200)
  return res.json()
}

describe('builtin-tracing', () => {
  describe('tracing: true without an instrumentation file', () => {
    const { next, isNextStart } = nextTestSetup({
      files: fixture('tracing'),
      dependencies: OTEL_DEPENDENCIES,
    })

    it('registers OpenTelemetry in the Node.js runtime', async () => {
      expect(await probe(next, 'node')).toEqual({
        recording: true,
        activeSpanRecording: true,
        userRegisterCount: 0,
      })
    })

    it('registers OpenTelemetry in the Edge runtime', async () => {
      expect(await probe(next, 'edge')).toMatchObject({ recording: true })
    })

    if (isNextStart) {
      it('emits the instrumentation entry', async () => {
        expect(await next.hasFile('.next/server/instrumentation.js')).toBe(true)
      })
    }
  })

  describe('tracing: true with an instrumentation file', () => {
    const { next, isNextDeploy } = nextTestSetup({
      files: fixture('tracing', {
        'instrumentation.ts': new FileRef(
          join(__dirname, 'fixtures', 'user-file', 'instrumentation.ts')
        ),
      }),
      dependencies: OTEL_DEPENDENCIES,
    })

    it('runs only the project register', async () => {
      // The project file registers no provider, so a recording span means the
      // built-in also ran.
      expect(await probe(next, 'node')).toEqual({
        recording: false,
        activeSpanRecording: false,
        userRegisterCount: 1,
      })
      expect(await probe(next, 'edge')).toMatchObject({ recording: false })

      if (!isNextDeploy) {
        const nodeRegisters = next.cliOutput.match(
          /\[user-instrumentation\] register nodejs/g
        )
        expect(nodeRegisters).toHaveLength(1)
      }
    })
  })

  describe('tracing omitted', () => {
    const { next, isNextStart } = nextTestSetup({
      files: fixture('omitted'),
      dependencies: OTEL_DEPENDENCIES,
    })

    it('registers no provider', async () => {
      expect(await probe(next, 'node')).toEqual({
        recording: false,
        activeSpanRecording: false,
        userRegisterCount: 0,
      })
      expect(await probe(next, 'edge')).toMatchObject({ recording: false })
    })

    if (isNextStart) {
      it('emits no instrumentation entry', async () => {
        expect(await next.hasFile('.next/server/instrumentation.js')).toBe(
          false
        )
      })
    }
  })
})
