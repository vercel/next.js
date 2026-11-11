import assert from 'node:assert/strict'
import { cp, mkdtemp, readFile, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { nextTestSetup, isNextStart } from 'e2e-utils'
import { execFile, execFileSync } from 'node:child_process'
import { promisify } from 'node:util'
import { createHash } from 'node:crypto'
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { retry } from 'next-test-utils'
import {
  createApplicationServer,
  type ApplicationServer,
} from 'next/dist/experimental/testing/browser/server'
import {
  createBrowserHost,
  type BrowserHost,
} from 'next/dist/experimental/testing/browser/host'
import { createBrowserFixture } from 'next/dist/experimental/testing/browser/fixture'

// The framework prepares an isolated installation; H owns the app/browser.
// Compiled driver execution is additionally checked by the stage reference lane.
describe('registered Next App Page component host', () => {
  let server: ApplicationServer
  let host: BrowserHost
  // Register before the framework teardown so its installation is not removed
  // while our server still watches or serves it.
  afterAll(async () => {
    try {
      await host?.dispose()
    } finally {
      await server?.dispose()
    }
  })

  const projectDir = join(__dirname, '../../../..')
  let helperArchive: string | undefined
  if (isNextStart) {
    const archiveDir = mkdtempSync(
      join(tmpdir(), 'next-h3-playwright-package-')
    )
    const packageDir = join(projectDir, 'packages/next-playwright')
    execFileSync('pnpm', ['pack', '--pack-destination', archiveDir], {
      cwd: packageDir,
      stdio: 'pipe',
    })
    const archives = readdirSync(archiveDir).filter((name) =>
      name.endsWith('.tgz')
    )
    assert.equal(archives.length, 1)
    helperArchive = join(archiveDir, archives[0])
    const sourceHashes = Object.fromEntries(
      [
        'package.json',
        'src/index.ts',
        'src/step.ts',
        'dist/index.js',
        'dist/step.js',
        'dist/index.d.ts',
        'dist/step.d.ts',
      ].map((file) => [
        file,
        createHash('sha256')
          .update(readFileSync(join(packageDir, file)))
          .digest('hex'),
      ])
    )
    writeFileSync(
      join(archiveDir, 'provenance.json'),
      JSON.stringify(
        {
          archive: helperArchive,
          sha256: createHash('sha256')
            .update(readFileSync(helperArchive))
            .digest('hex'),
          sourceHashes,
        },
        null,
        2
      )
    )
    console.log(
      'H3 helper package provenance:',
      join(archiveDir, 'provenance.json')
    )
  }
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    skipDeployment: true,
    dependencies: helperArchive
      ? { playwright: '1.61.0', '@next/playwright': `file:${helperArchive}` }
      : undefined,
  })
  let outputDir: string
  let cleanups: Array<() => Promise<void>> = []

  beforeAll(async () => {
    outputDir = await mkdtemp(join(tmpdir(), 'next-component-host-'))
    server = await createApplicationServer({
      projectDir: next.testDir,
      mode: isNextDev ? 'development' : 'production',
      distDir: join(next.testDir, '.next'),
      outputLockEnabled: true,
      browserFixtures: isNextDev
        ? [
            {
              id: 'greeting',
              module: join(next.testDir, 'fixtures/greeting.tsx'),
              exportName: 'default',
            },
          ]
        : undefined,
      outputDir,
      signal: new AbortController().signal,
    })
    host = await createBrowserHost({
      projectDir,
      signal: new AbortController().signal,
    })
  })

  afterEach(async () => {
    const errors: unknown[] = []
    for (const cleanup of cleanups.reverse()) {
      try {
        await cleanup()
      } catch (error) {
        errors.push(error)
      }
    }
    cleanups = []
    assert.deepEqual(errors, [])
  })

  async function fixture(controller = new AbortController()) {
    return createBrowserFixture({
      projectDir,
      wsEndpoint: host.wsEndpoint,
      baseURL: server.baseURL,
      componentHost: server.componentHost,
      outputDir,
      assertActiveAttempt: () => controller.signal.throwIfAborted(),
      attempt: {
        signal: controller.signal,
        onCleanup: (fn) => cleanups.push(fn),
      },
      onAttachment() {},
    })
  }

  it('uses actual instant(), then hydrates the normal application route', async () => {
    if (!isNextDev) expect(server.build?.testingApiEnabled).toBe(true)
    expect(
      await (await fetch(`${server.baseURL}/instrumented`)).json()
    ).toEqual({ registered: true })
    const resource = await fixture()
    await resource.page.goto('/')
    await resource.instant(async () => {
      await resource.page.getByRole('link', { name: 'Open fixture' }).click()
      await resource.page.locator('#loading').waitFor()
      expect(await resource.page.getByRole('heading').count()).toBe(0)
    })
    await resource.page
      .getByRole('heading', { name: 'Server fixture: application' })
      .waitFor()
    await resource.page.getByRole('button', { name: 'Count 0' }).click()
    await resource.page.getByRole('button', { name: 'Count 1' }).waitFor()
  })

  if (isNextDev) {
    it('mounts an async server-only fixture and interacts with a real client boundary', async () => {
      const resource = await fixture()
      const root = await resource.mount('greeting', { label: 'registered' })
      expect(await root.getByRole('heading').textContent()).toBe(
        'Server fixture: registered'
      )
      await root.getByRole('button', { name: 'Count 0' }).click()
      await root.getByRole('button', { name: 'Count 1' }).waitFor()
      await expect(resource.mount('unknown', {})).rejects.toThrow(
        'Unknown registered'
      )
      await expect(
        resource.mount('greeting', { callback() {} })
      ).rejects.toThrow('JSON data')
      const unknown = await fetch(
        `${server.baseURL}${server.componentHost!.routePrefix}/unknown?__nextFixtureProps=%7B%7D`
      )
      expect(unknown.status).toBe(404)
    })

    it('reclaims a cancelled context and creates a fresh root for the next attempt', async () => {
      const controller = new AbortController()
      const first = await fixture(controller)
      await first.mount('greeting', { label: 'first' })
      await first.context.addCookies([
        { name: 'attempt', value: 'first', url: server.baseURL },
      ])
      controller.abort(new Error('attempt cancelled'))
      await first.dispose()
      expect(first.page.isClosed()).toBe(true)
      await expect(first.mount('greeting', {})).rejects.toThrow(
        'attempt cancelled'
      )
      const second = await fixture()
      expect(await second.context.cookies()).toEqual([])
      const root = await second.mount('greeting', { label: 'second' })
      await retry(async () =>
        expect(await root.getByRole('button').textContent()).toBe('Count 0')
      )
    })

    it('keeps private fixtures reachable after an ordinary route watcher refresh', async () => {
      const resource = await fixture()
      await resource.mount('greeting', { label: 'before refresh' })
      await next.patchFile(
        'app/refresh/page.tsx',
        await next.readFile('fixtures/refresh-page.tsx')
      )
      await retry(async () => {
        const response = await fetch(`${server.baseURL}/refresh`)
        expect(response.status).toBe(200)
        expect(await response.text()).toContain(
          'New route after watcher refresh'
        )
      })
      const root = await resource.mount('greeting', { label: 'after refresh' })
      expect(await root.getByRole('heading').textContent()).toBe(
        'Server fixture: after refresh'
      )
      await root.getByRole('button', { name: 'Count 0' }).click()
      await root.getByRole('button', { name: 'Count 1' }).waitFor()
    })

    it('mounts beneath the actual nonempty application basePath', async () => {
      await server.dispose()
      await next.patchFile(
        'next.config.js',
        `module.exports = { basePath: '/docs', cacheComponents: true }`
      )
      server = await createApplicationServer({
        projectDir: next.testDir,
        mode: 'development',
        outputLockEnabled: true,
        browserFixtures: [
          {
            id: 'greeting',
            module: join(next.testDir, 'fixtures/greeting.tsx'),
            exportName: 'default',
          },
        ],
        outputDir,
        signal: new AbortController().signal,
      })
      expect(server.componentHost!.routePrefix).toMatch(
        /^\/docs\/__next_testing_/
      )
      const resource = await fixture()
      const root = await resource.mount('greeting', { label: 'base path' })
      expect(new URL(resource.page.url()).pathname).toMatch(
        /^\/docs\/__next_testing_/
      )
      expect(await root.getByRole('heading').textContent()).toBe(
        'Server fixture: base path'
      )
      await root.getByRole('button', { name: 'Count 0' }).click()
      await root.getByRole('button', { name: 'Count 1' }).waitFor()
    })
  } else {
    it('includes the active instant implementation in the instrumented build', async () => {
      const root = join(next.testDir, '.next/static')
      const files = await readdir(root, { recursive: true })
      const scripts = await Promise.all(
        files
          .filter((file) => file.endsWith('.js'))
          .map((file) => readFile(join(root, file), 'utf8'))
      )
      expect(scripts.some((script) => /cookieStore\.get/.test(script))).toBe(
        true
      )
      expect(
        scripts.some((script) => /cookieStore\.addEventListener/.test(script))
      ).toBe(true)
    })

    it('retains the normal build output lock while the application is serving', async () => {
      const contender = await next.build()
      expect(contender.exitCode).not.toBe(0)
      expect(contender.cliOutput).toMatch(/lock|already running/i)
      expect((await fetch(`${server.baseURL}/instrumented`)).status).toBe(200)
    })

    it('does not admit component mounting in a production server', async () => {
      expect(server.componentHost).toBeUndefined()
      const resource = await fixture()
      await expect(resource.mount('greeting', {})).rejects.toThrow(
        'registered development fixtures'
      )
      expect(
        (await fetch(`${server.baseURL}/__next_testing_unknown/greeting`))
          .status
      ).toBe(404)
    })

    it('builds an ordinary application without active fixture or instant transport', async () => {
      await server.dispose()
      await next.patchFile(
        'next.config.js',
        'module.exports = { cacheComponents: true }'
      )
      server = await createApplicationServer({
        projectDir: next.testDir,
        mode: 'production',
        distDir: join(next.testDir, '.next'),
        outputLockEnabled: true,
        outputDir,
        signal: new AbortController().signal,
      })
      expect(server.build?.testingApiEnabled).toBe(false)
      const resource = await fixture()
      await resource.context.addCookies([
        {
          name: 'next-instant-navigation-testing',
          value: JSON.stringify([0, 'ordinary']),
          url: server.baseURL,
        },
      ])
      await resource.page.goto('/fixture')
      await resource.page
        .getByRole('heading', { name: 'Server fixture: application' })
        .waitFor()
      await resource.page.getByRole('button', { name: 'Count 0' }).click()
      await resource.page.getByRole('button', { name: 'Count 1' }).waitFor()
      const paths = await readFile(
        join(next.testDir, '.next/server/app-paths-manifest.json'),
        'utf8'
      )
      expect(paths).not.toContain('__next_testing_')
      const chunks = join(next.testDir, '.next/static')
      const files = await readdir(chunks, { recursive: true })
      const scripts = await Promise.all(
        files
          .filter((file) => file.endsWith('.js'))
          .map((file) => readFile(join(chunks, file), 'utf8'))
      )
      expect(scripts.length).toBeGreaterThan(0)
      for (const script of scripts) {
        // The shared header constant survives in ordinary builds. Assert the
        // active Cookie Store implementation and fixture harness are absent.
        expect(
          /__nextFixtureProps|data-next-test-root|cookieStore\.(?:get|addEventListener)/.test(
            script
          )
        ).toBe(false)
      }
    })

    it('rejects phase-dependent startup output even when that output has a valid old build', async () => {
      await server.dispose()
      await cp(join(next.testDir, '.next'), join(next.testDir, '.other'), {
        recursive: true,
      })
      await next.patchFile(
        'next.config.js',
        `module.exports = (phase) => ({ cacheComponents: true, distDir: phase === 'phase-production-server' ? '.other' : '.next' })`
      )
      const error = await createApplicationServer({
        projectDir: next.testDir,
        mode: 'production',
        distDir: join(next.testDir, '.next'),
        outputLockEnabled: true,
        outputDir,
        signal: new AbortController().signal,
      }).then(
        async (unexpected) => {
          await unexpected.dispose()
          return undefined
        },
        (failure) => failure
      )
      expect(error?.name).toBe('ApplicationServerError')
      const logs = await Promise.all(
        error.attachments.map((attachment: { path: string }) =>
          readFile(attachment.path, 'utf8')
        )
      )
      expect(logs.join('\n')).toContain(
        'does not match the locked application build'
      )
    })

    it('compiles and executes a production browser driver through the owned worker', async () => {
      await server.dispose()
      await next.patchFile(
        'next.config.js',
        `module.exports = { cacheComponents: true, experimental: { exposeTestingApiInProductionBuild: true } }`
      )
      const nativeHash = execFileSync(
        process.execPath,
        [join(__dirname, 'probe-native.cjs')],
        { cwd: projectDir, encoding: 'utf8' }
      ).trim()
      const { stdout } = await promisify(execFile)(
        process.execPath,
        [
          join(__dirname, 'run-owned-production-driver.mjs'),
          '180000',
          join(outputDir, 'driver-processes'),
          join(next.testDir, 'run-production-driver.cjs'),
          outputDir,
          nativeHash,
        ],
        {
          cwd: next.testDir,
          env: {
            ...process.env,
            NODE_ENV: 'production',
            NEXT_TELEMETRY_DISABLED: '1',
          },
          maxBuffer: 10 * 1024 * 1024,
        }
      )
      expect(stdout).toContain('H3_PRODUCTION_BROWSER_DRIVER_PASSED')
      console.log(
        'H3 driver evidence:',
        join(outputDir, 'production-driver-evidence.json')
      )
    })
  }
})
