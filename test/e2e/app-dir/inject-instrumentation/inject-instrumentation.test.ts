import { FileRef, nextTestSetup } from 'e2e-utils'
import glob from 'glob'
import { join, resolve } from 'path'

function fixture(
  config: 'inject' | 'page-ext' | 'omitted' | 'externals',
  extra = {}
) {
  return {
    app: new FileRef(join(__dirname, 'app')),
    // External packages are Node.js-only. Don't mix in Edge bundles, where
    // these packages must be bundled, when inspecting the emitted code.
    ...(config !== 'externals'
      ? { 'middleware.ts': new FileRef(join(__dirname, 'middleware.ts')) }
      : {}),
    ...(config !== 'omitted'
      ? { injected: new FileRef(join(__dirname, 'injected')) }
      : {}),
    'next.config.ts': new FileRef(
      join(__dirname, 'fixtures', config, 'next.config.ts')
    ),
    ...extra,
  }
}

describe('inject-instrumentation', () => {
  describe('injected package resolution', () => {
    const { next } = nextTestSetup({
      files: fixture('externals', {
        packages: new FileRef(join(__dirname, 'fixtures', 'packages')),
        'app/instrumentation-externals/route.ts': new FileRef(
          join(__dirname, 'fixtures', 'externals', 'route.ts')
        ),
      }),
      dependencies: {
        'external-instrumentation': 'file:./packages/external-instrumentation',
        'bundled-instrumentation': 'file:./packages/bundled-instrumentation',
      },
    })

    it('runs injected packages and filesystem entries', async () => {
      const result = await next
        .fetch('/instrumentation-externals')
        .then((res) => res.json())

      expect(result.packages).toEqual([
        {
          name: 'external-instrumentation',
          marker: 'external-instrumentation:register-implementation',
        },
        {
          name: 'bundled-instrumentation',
          marker: 'bundled-instrumentation:register-implementation',
        },
      ])
      expect(result.injected).toEqual(['first', 'second'])
    })

    // Deploy mode has no local build output; hook execution is asserted above.
    // @force-gate !deploy
    it('keeps the opted-out implementation out of emitted server bundles', async () => {
      await next.fetch('/instrumentation-externals')

      const files = glob.sync('**/*.js', {
        cwd: join(next.testDir, next.distDir, 'server'),
      })
      expect(files.length).toBeGreaterThan(0)
      const bundles = (
        await Promise.all(
          files.map((file) => next.readFile(join(next.distDir, 'server', file)))
        )
      ).join('\n')

      expect(bundles).toContain(
        'bundled-instrumentation:register-implementation'
      )
      expect(bundles).not.toContain(
        'external-instrumentation:register-implementation'
      )
    })

    // NFT manifests are only available in local production builds.
    // @force-gate start
    it('traces the external instrumentation package', async () => {
      const trace = (await next.readJSON(
        join(next.distDir, 'server', 'instrumentation.js.nft.json')
      )) as { files: string[] }
      const traceDir = join(next.testDir, next.distDir, 'server')
      const tracedFiles = trace.files.map((file) =>
        resolve(traceDir, file).replace(/\\/g, '/')
      )

      expect(tracedFiles).toContainEqual(
        expect.stringMatching(
          /\/node_modules\/external-instrumentation\/init\.js$/
        )
      )
    })
  })

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

  describe('a project instrumentation file with a compound page extension', () => {
    const { next } = nextTestSetup({
      files: fixture('page-ext', {
        'instrumentation.page.ts': new FileRef(
          join(__dirname, 'fixtures', 'user-file', 'instrumentation.ts')
        ),
      }),
    })

    it('chains instrumentation.page.ts after the inject', async () => {
      expect(await next.fetch('/node').then((res) => res.json())).toEqual({
        instrumentation: 'user',
        injected: ['first', 'second'],
      })
      expect(await next.fetch('/edge').then((res) => res.json())).toEqual({
        instrumentation: 'user',
        injected: ['first', 'second'],
      })
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
