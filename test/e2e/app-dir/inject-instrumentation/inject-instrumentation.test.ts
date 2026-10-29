import { FileRef, nextTestSetup } from 'e2e-utils'
import { join } from 'path'

function fixture(config: 'inject' | 'omitted', extra = {}) {
  return {
    app: new FileRef(join(__dirname, 'app')),
    'middleware.ts': new FileRef(join(__dirname, 'middleware.ts')),
    ...(config === 'inject'
      ? { injected: new FileRef(join(__dirname, 'injected')) }
      : {}),
    'next.config.ts': new FileRef(
      join(__dirname, 'fixtures', config, 'next.config.ts')
    ),
    ...extra,
  }
}

describe('inject-instrumentation', () => {
  describe('injectInstrumentation without a project file', () => {
    const { next, isNextStart } = nextTestSetup({
      files: fixture('inject'),
    })

    it('runs every injected register in Node.js, in order', async () => {
      expect(await next.fetch('/node').then((res) => res.json())).toEqual({
        instrumentation: 'inject',
        injected: ['first', 'second'],
      })
    })

    it('runs every injected register in the Edge runtime, in order', async () => {
      expect(await next.fetch('/edge').then((res) => res.json())).toEqual({
        instrumentation: 'inject',
        injected: ['first', 'second'],
      })
    })

    if (isNextStart) {
      it('emits the instrumentation entry', async () => {
        expect(await next.hasFile('.next/server/instrumentation.js')).toBe(true)
      })
    }
  })

  describe('a project instrumentation file chains after the inject', () => {
    const { next, isNextDeploy } = nextTestSetup({
      files: fixture('inject', {
        'instrumentation.ts': new FileRef(
          join(__dirname, 'fixtures', 'user-file', 'instrumentation.ts')
        ),
      }),
    })

    it('runs the injected registers, then the project register', async () => {
      // Each register sets `instrumentation`, so 'user' means the project
      // file ran last.
      expect(await next.fetch('/node').then((res) => res.json())).toEqual({
        instrumentation: 'user',
        injected: ['first', 'second'],
      })
      expect(await next.fetch('/edge').then((res) => res.json())).toEqual({
        instrumentation: 'user',
        injected: ['first', 'second'],
      })

      if (!isNextDeploy) {
        const nodeRegisters = next.cliOutput.match(
          /\[user-instrumentation\] register nodejs/g
        )
        expect(nodeRegisters).toHaveLength(1)
        expect(next.cliOutput).toContain(
          '[inject-instrumentation] register first nodejs'
        )
      }
    })
  })

  describe('no inject and no project file', () => {
    const { next, isNextStart } = nextTestSetup({
      files: fixture('omitted'),
    })

    it('runs no instrumentation', async () => {
      expect(await next.fetch('/node').then((res) => res.json())).toEqual({
        instrumentation: 'none',
        injected: [],
      })
      expect(await next.fetch('/edge').then((res) => res.json())).toEqual({
        instrumentation: 'none',
        injected: [],
      })
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
