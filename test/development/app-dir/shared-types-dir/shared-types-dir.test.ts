import { join } from 'path'
import execa from 'execa'
import { nextTestSetup, type NextInstance } from 'e2e-utils'
import { retry } from 'next-test-utils'

// The fixture lives in its own directory so this test file is not copied into
// the app, where `tsc` would type-check it.
const FIXTURE_DIR = join(__dirname, 'fixture')

const TYPES_DIR = '.next/types'
const DEV_TYPES_DIR = '.next/dev/types'
// Files written by the shared type generator. `link.d.ts` is only written
// when `typedRoutes` is enabled.
const OWNED_FILES = [
  'routes.d.ts',
  'validator.ts',
  'cache-life.d.ts',
  'root-params.d.ts',
  'link.d.ts',
]

async function readOwnedFiles(next: NextInstance, dir = TYPES_DIR) {
  const files: Record<string, string> = {}
  for (const file of OWNED_FILES) {
    const path = `${dir}/${file}`
    if (await next.hasFile(path)) {
      files[file] = await next.readFile(path)
    }
  }
  return files
}

async function waitForSharedRoute(next: NextInstance, route: string) {
  await retry(async () => {
    const content = await next
      .readFile(`${TYPES_DIR}/routes.d.ts`)
      .catch(() => '')
    expect(content).toContain(`"${route}"`)
  })
}

function nextEnv() {
  const env = { ...process.env, __NEXT_TEST_MODE: 'true' }
  // Let Next.js decide the environment.
  delete env.NODE_ENV
  return env
}

// Holds the types lock in a separate process, using the app's `next` install,
// until `release` is called.
async function holdTypesLock(next: NextInstance) {
  const holder = execa(
    'node',
    [
      '-e',
      `
        const { loadBindings } = require('next/dist/build/swc')
        const { Lockfile } = require('next/dist/build/lockfile')
        loadBindings().then(() => {
          const lockfile = Lockfile.tryAcquire(process.argv[1])
          if (!lockfile) throw new Error('lock is already held')
          console.log('locked')
          process.stdin.once('data', async () => {
            await lockfile.unlock()
            process.exit(0)
          })
        })
      `,
      `${TYPES_DIR}/lock`,
    ],
    { cwd: next.testDir, env: nextEnv(), extendEnv: false }
  )
  let output = ''
  holder.stdout!.on('data', (chunk) => {
    output += chunk
  })
  holder.stderr!.on('data', (chunk) => {
    output += chunk
  })
  await retry(async () => {
    expect(output).toContain('locked')
  })
  return {
    async release() {
      holder.stdin!.write('release\n')
      expect((await holder).exitCode).toBe(0)
    },
  }
}

// Runs the app's own `next` install, so React resolves from the app (like
// `next.build()`). Unlike `next.build()`, it can run while `next dev` runs.
async function runNext(next: NextInstance, args: string[]) {
  const env = nextEnv()
  const result = await execa(
    'pnpm',
    [
      'next',
      ...args,
      ...(args[0] === 'build' && process.env.IS_WEBPACK_TEST
        ? ['--webpack']
        : []),
    ],
    {
      cwd: next.testDir,
      env,
      extendEnv: false,
      reject: false,
    }
  )
  const code = result.exitCode
  const output = `${result.stdout}${result.stderr}`
  // Prints the command output on failure.
  expect({ code, output: code === 0 ? '' : output }).toEqual({
    code: 0,
    output: '',
  })
  return output
}

async function runTsc(next: NextInstance) {
  const result = await execa('pnpm', ['tsc', '--noEmit'], {
    cwd: next.testDir,
    reject: false,
  })
  return {
    exitCode: result.exitCode,
    output: `${result.stdout}${result.stderr}`,
  }
}

function getNextEnvImports(content: string) {
  return Array.from(content.matchAll(/^import "\.\/(.+)";$/gm), (m) => m[1])
}

describe('shared-types-dir', () => {
  describe('next dev and next typegen', () => {
    const { next } = nextTestSetup({
      files: FIXTURE_DIR,
    })

    it('should write the same types to the shared directory', async () => {
      await waitForSharedRoute(next, '/blog/[slug]')
      const devFiles = await readOwnedFiles(next)
      expect(Object.keys(devFiles)).toEqual(
        expect.arrayContaining(['routes.d.ts', 'validator.ts'])
      )
      // Dev no longer writes its own copy of the shared types.
      expect(await readOwnedFiles(next, DEV_TYPES_DIR)).toEqual({})

      const devNextEnv = await next.readFile('next-env.d.ts')
      await next.stop()

      await runNext(next, ['typegen'])
      expect(await readOwnedFiles(next)).toEqual(devFiles)
      expect(await next.readFile('next-env.d.ts')).toEqual(devNextEnv)
    })
  })

  describe('next-env.d.ts', () => {
    const { next } = nextTestSetup({
      files: FIXTURE_DIR,
    })

    it('should be identical after next dev, next typegen and next build', async () => {
      await waitForSharedRoute(next, '/blog/[slug]')
      const devNextEnv = await next.readFile('next-env.d.ts')
      for (const imported of getNextEnvImports(devNextEnv)) {
        expect(imported).toStartWith(`${TYPES_DIR}/`)
      }
      await next.stop()

      await runNext(next, ['typegen'])
      expect(await next.readFile('next-env.d.ts')).toEqual(devNextEnv)

      const { exitCode } = await next.build()
      expect(exitCode).toBe(0)
      expect(await next.readFile('next-env.d.ts')).toEqual(devNextEnv)
    })
  })

  describe('next dev startup', () => {
    const { next } = nextTestSetup({
      files: FIXTURE_DIR,
    })

    it('should create every imported types file and not empty existing ones', async () => {
      await waitForSharedRoute(next, '/blog/[slug]')
      await next.stop()

      // A fresh start: every file imported by next-env.d.ts exists once dev
      // setup has completed (signalled by serving the first request). Ready
      // is logged earlier, before Next.js loads config and sets up dev.
      await next.deleteFile('.next')
      await next.start()
      expect((await next.fetch('/')).status).toBe(200)
      const nextEnv = await next.readFile('next-env.d.ts')
      for (const imported of getNextEnvImports(nextEnv)) {
        expect({ imported, exists: await next.hasFile(imported) }).toEqual({
          imported,
          exists: true,
        })
      }
      await waitForSharedRoute(next, '/blog/[slug]')
      const generated = await readOwnedFiles(next)
      await next.stop()

      // A restart: existing types are never replaced by placeholders, while
      // the dev server starts up and regenerates them.
      await next.start()
      const setup = next.fetch('/')
      let settled = false
      void setup.finally(() => {
        settled = true
      })
      do {
        expect(await readOwnedFiles(next)).toEqual(generated)
      } while (!settled)
      expect((await setup).status).toBe(200)
      await retry(async () => {
        expect(await readOwnedFiles(next)).toEqual(generated)
      })

      const tsc = await runTsc(next)
      expect(tsc).toEqual({ exitCode: 0, output: expect.any(String) })
    })
  })

  describe('next dev migration', () => {
    const { next } = nextTestSetup({
      files: FIXTURE_DIR,
      skipStart: true,
    })

    it('should remove the route types older versions wrote to .next/dev/types', async () => {
      for (const file of OWNED_FILES) {
        await next.patchFile(`${DEV_TYPES_DIR}/${file}`, 'export {}\n')
      }

      // `next dev` cleans its dev distDir on startup, so the copies don't
      // duplicate the shared declarations.
      await next.start()
      expect((await next.fetch('/')).status).toBe(200)

      expect(await readOwnedFiles(next, DEV_TYPES_DIR)).toEqual({})
      await waitForSharedRoute(next, '/blog/[slug]')
    })
  })

  describe('types lock', () => {
    const { next } = nextTestSetup({
      files: FIXTURE_DIR,
    })

    it('should wait for the types lock and generate once it is released', async () => {
      await waitForSharedRoute(next, '/blog/[slug]')
      const devFiles = await readOwnedFiles(next)
      await next.stop()
      await next.deleteFile(`${TYPES_DIR}/routes.d.ts`)

      const lock = await holdTypesLock(next)
      const typegen = execa('pnpm', ['next', 'typegen'], {
        cwd: next.testDir,
        env: nextEnv(),
        extendEnv: false,
        reject: false,
      })
      let output = ''
      typegen.stdout!.on('data', (chunk) => {
        output += chunk
      })
      typegen.stderr!.on('data', (chunk) => {
        output += chunk
      })
      try {
        // typegen reports a long wait, and writes nothing while another
        // process holds the lock.
        await retry(async () => {
          expect(output).toContain(
            'Waiting for another Next.js process to finish generating types'
          )
        }, 20_000)
        expect(await next.hasFile(`${TYPES_DIR}/routes.d.ts`)).toBe(false)
      } finally {
        await lock.release()
      }

      const { exitCode } = await typegen
      expect({ exitCode, output }).toEqual({ exitCode: 0, output })
      expect(output).not.toContain('Timed out waiting')
      expect(await readOwnedFiles(next)).toEqual(devFiles)
    })
  })

  describe('next dev route changes', () => {
    const { next } = nextTestSetup({
      files: FIXTURE_DIR,
    })

    it('should regenerate the shared types when routes are added or removed', async () => {
      await waitForSharedRoute(next, '/blog/[slug]')

      await next.patchFile(
        'app/new-route/page.tsx',
        'export default function Page() { return <p>new</p> }'
      )
      await waitForSharedRoute(next, '/new-route')

      await next.deleteFile('app/new-route')
      await retry(async () => {
        const content = await next.readFile(`${TYPES_DIR}/routes.d.ts`)
        expect(content).not.toContain('"/new-route"')
      })
    })
  })

  describe('next build', () => {
    const { next } = nextTestSetup({
      files: FIXTURE_DIR,
    })

    it('should keep the shared types while next dev is running', async () => {
      await waitForSharedRoute(next, '/blog/[slug]')
      const devFiles = await readOwnedFiles(next)
      // Not owned by the shared generator, so build still cleans it.
      await next.patchFile(`${TYPES_DIR}/app/stale.ts`, 'export {}\n')
      // Stands in for an in-flight atomic write of another process.
      const pendingWrite = `${TYPES_DIR}/.tmp/routes.d.ts.1.0000.tmp`
      await next.patchFile(pendingWrite, 'export {}\n')

      await runNext(next, ['build'])

      expect(await readOwnedFiles(next)).toEqual(devFiles)
      expect(await next.hasFile(`${TYPES_DIR}/app/stale.ts`)).toBe(false)
      expect(await next.hasFile(pendingWrite)).toBe(true)
    })

    it('should generate types for all routes with --debug-build-paths', async () => {
      await next.stop()
      await next.deleteFile(TYPES_DIR)

      const { exitCode } = await next.build({
        args: ['--debug-build-paths', 'app/page.tsx'],
      })
      expect(exitCode).toBe(0)
      expect(await next.readFile(`${TYPES_DIR}/routes.d.ts`)).toContain(
        '"/blog/[slug]"'
      )
    })
  })

  describe.each([
    ['with the types lock', {}],
    ['without locking', { experimental: { lockDistDir: false } }],
  ])('concurrent next typegen %s', (_, nextConfig) => {
    const { next } = nextTestSetup({
      files: FIXTURE_DIR,
      nextConfig,
    })

    it('should always leave complete shared types', async () => {
      await waitForSharedRoute(next, '/blog/[slug]')
      const devFiles = await readOwnedFiles(next)

      const outputs = await Promise.all([
        runNext(next, ['typegen']),
        runNext(next, ['typegen']),
        runNext(next, ['typegen']),
      ])

      for (const output of outputs) {
        expect(output).not.toContain('Waiting for another')
      }
      expect(await readOwnedFiles(next)).toEqual(devFiles)
    })
  })

  describe('typedRoutes', () => {
    const { next } = nextTestSetup({
      files: FIXTURE_DIR,
      nextConfig: { typedRoutes: true },
      skipStart: true,
    })

    it('should remove link.d.ts when typedRoutes is disabled', async () => {
      await runNext(next, ['typegen'])
      expect(await next.hasFile(`${TYPES_DIR}/link.d.ts`)).toBe(true)

      await next.patchFile(
        'next.config.js',
        'module.exports = { typedRoutes: false }\n'
      )
      await runNext(next, ['typegen'])
      expect(await next.hasFile(`${TYPES_DIR}/link.d.ts`)).toBe(false)
    })
  })
})
