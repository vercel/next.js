import fs from 'node:fs/promises'
import { join } from 'node:path'
import { ChildProcess } from 'node:child_process'
import { FileRef, nextTestSetup } from 'e2e-utils'
import {
  fetchViaHTTP,
  findPort,
  initNextServerScript,
  killApp,
  withInvocationId,
} from 'next-test-utils'

const GOOGLEBOT_UA =
  'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'

const TWITTERBOT_UA = 'Twitterbot/1.0'

// Regression test for the PPR resume metadata tree mismatch: a resume must
// render the same metadata tree shape as the prerender that postponed it,
// regardless of the requesting user agent. Previously, bot user agents forced
// `serveStreamingMetadata` to `false` during the resume while the prerender
// rendered with it enabled, causing:
//   "Expected the resume to render <div> in this slot but instead it
//    rendered <__next_metadata_boundary__>."
// and a fallback to client rendering.
describe('ppr-resume-bot-metadata', () => {
  let server: ChildProcess
  let appPort: number | string
  let dynamicPostpone: string
  let cliOutput = ''

  beforeAll(() => {
    process.env.NOW_BUILDER = '1'
    process.env.NEXT_PRIVATE_TEST_HEADERS = '1'
  })

  const { next } = nextTestSetup({
    files: {
      app: new FileRef(join(__dirname, 'app')),
    },
    nextConfig: {
      cacheComponents: true,
      output: 'standalone',
    },
  })

  beforeAll(async () => {
    // Stop the server, we're going to restart it using the standalone server
    // in minimal mode below.
    await next.stop()

    // Read the postponed state that was generated at build time.
    dynamicPostpone = (await next.readJSON('.next/server/app/dynamic.meta'))
      .postponed

    if (typeof dynamicPostpone !== 'string') {
      throw new Error(
        'invariant: expected the build to generate postponed state for /dynamic'
      )
    }

    await fs.rename(
      join(next.testDir, '.next/standalone'),
      join(next.testDir, 'standalone')
    )

    const serverFilePath = join(next.testDir, 'standalone/server.js')

    // We're going to use the minimal mode for the server, which is how the
    // server runs when deployed: the platform serves the static shell from
    // its cache and invokes the server only to resume the postponed state.
    await fs.writeFile(
      serverFilePath,
      (await fs.readFile(serverFilePath, 'utf8')).replace(
        'port:',
        `minimalMode: true, port:`
      )
    )

    appPort = await findPort()

    server = await initNextServerScript(
      serverFilePath,
      /- Local:/,
      {
        ...process.env,
        ...next.env,
        __NEXT_TEST_MODE: 'e2e',
        PORT: `${appPort}`,
      },
      undefined,
      {
        cwd: next.testDir,
        onStderr(data) {
          cliOutput += data
        },
        onStdout(data) {
          cliOutput += data
        },
      }
    )
  })

  afterAll(async () => {
    delete process.env.NOW_BUILDER
    delete process.env.NEXT_PRIVATE_TEST_HEADERS
    if (server) await killApp(server)
  })

  it.each([
    ['a browser', undefined],
    // DOM bots (resolves `getBotType()` to 'dom').
    ['Googlebot', GOOGLEBOT_UA],
    // HTML-limited bots (resolves `getBotType()` to 'html').
    ['Twitterbot', TWITTERBOT_UA],
  ])(
    'should resume without a metadata tree mismatch for %s',
    async (_label, userAgent) => {
      const before = cliOutput.length

      const res = await fetchViaHTTP(
        appPort,
        '/dynamic',
        undefined,
        withInvocationId({
          headers: {
            'x-matched-path': '/dynamic',
            'next-resume': '1',
            ...(userAgent ? { 'user-agent': userAgent } : {}),
          },
          method: 'POST',
          body: dynamicPostpone,
        })
      )

      expect(res.status).toBe(200)

      const html = await res.text()

      // The dynamic content must be rendered into the resumed HTML rather
      // than deferred to client rendering.
      expect(html).toContain('dynamic content')
      expect(html).toContain('dynamic-metadata-title')

      // React must not have bailed out of the resume.
      expect(cliOutput.slice(before)).not.toContain(
        'Expected the resume to render'
      )
    }
  )
})
