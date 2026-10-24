import { FileRef, isNextDeploy, nextTestSetup } from 'e2e-utils'
import { join } from 'path'

// Source files live outside `.vercel/` and `node_modules/` so git tracks them.
// The test app gets the layout the adapter writes during a Vercel build.
function otelCopy() {
  const dir = join(__dirname, 'otel-copy')
  return {
    '.vercel/otel/instrumentation.js': new FileRef(
      join(dir, 'instrumentation.js')
    ),
    '.vercel/otel/node_modules/@vercel/otel/package.json': new FileRef(
      join(dir, 'vercel-otel-package.json')
    ),
    '.vercel/otel/node_modules/@vercel/otel/index.js': new FileRef(
      join(dir, 'vercel-otel-index.js')
    ),
    '.vercel/otel/node_modules/@opentelemetry/api-logs/package.json':
      new FileRef(join(dir, 'api-logs-package.json')),
    '.vercel/otel/node_modules/@opentelemetry/api-logs/index.js': new FileRef(
      join(dir, 'api-logs-index.js')
    ),
  }
}

function fixture(config: 'inject' | 'omitted', extra = {}) {
  return {
    app: new FileRef(join(__dirname, 'app')),
    'middleware.ts': new FileRef(join(__dirname, 'middleware.ts')),
    ...(config === 'inject' ? otelCopy() : {}),
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
  // Deploy mode uploads the fixture, and the Vercel client excludes `.vercel`.
  // The builder writes this directory after upload, so the harness cannot
  // represent it. Local build and dev still compile the path.
  ;(isNextDeploy ? describe.skip : describe)(
    'injectInstrumentation without a project file',
    () => {
      const { next, isNextStart } = nextTestSetup({
        files: fixture('inject'),
      })

      it('runs the injected register in Node.js', async () => {
        expect(await probe(next, 'node')).toEqual({ instrumentation: 'inject' })
      })

      it('runs the injected register in the Edge runtime', async () => {
        expect(await probe(next, 'edge')).toEqual({ instrumentation: 'inject' })
      })

      if (isNextStart) {
        it('emits the instrumentation entry', async () => {
          expect(await next.hasFile('.next/server/instrumentation.js')).toBe(
            true
          )
        })
      }
    }
  )

  describe('a project instrumentation file replaces the inject', () => {
    const { next, isNextDeploy } = nextTestSetup({
      files: fixture('inject', {
        'instrumentation.ts': new FileRef(
          join(__dirname, 'fixtures', 'user-file', 'instrumentation.ts')
        ),
      }),
    })

    it('runs only the project register', async () => {
      expect(await probe(next, 'node')).toEqual({ instrumentation: 'user' })
      expect(await probe(next, 'edge')).toEqual({ instrumentation: 'user' })

      if (!isNextDeploy) {
        const nodeRegisters = next.cliOutput.match(
          /\[user-instrumentation\] register nodejs/g
        )
        expect(nodeRegisters).toHaveLength(1)
        expect(next.cliOutput).not.toContain('[inject-instrumentation]')
      }
    })
  })

  describe('no inject and no project file', () => {
    const { next, isNextStart } = nextTestSetup({
      files: fixture('omitted'),
    })

    it('runs no instrumentation', async () => {
      expect(await probe(next, 'node')).toEqual({ instrumentation: 'none' })
      expect(await probe(next, 'edge')).toEqual({ instrumentation: 'none' })
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
