import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'e2e-utils'
import { fetchViaHTTP, File, nextBuild } from 'next-test-utils'
import { join } from 'path'
import stripAnsi from 'strip-ansi'

const pagePath = 'pages/index.jsx'
const apiPath = 'pages/api/edge.js'

;(process.env.IS_TURBOPACK_TEST ? describe.skip.each : describe.each)([
  { appDir: join(__dirname, './app/src'), title: 'src/pages and API routes' },
  { appDir: join(__dirname, './app'), title: 'pages and API routes' },
])('Configurable runtime for $title', ({ appDir }) => {
  let next: NextInstance
  const page = new File(join(appDir, pagePath))
  const api = new File(join(appDir, apiPath))

  if ((global as any).isNextDev) {
    describe('In development mode', () => {
      beforeAll(async () => {
        next = await createNext({
          files: new FileRef(appDir),
          dependencies: {},
          skipStart: true,
        })
      })

      afterEach(async () => {
        await next.stop()
        await next.patchFile(pagePath, page.originalContent)
        await next.patchFile(apiPath, api.originalContent)
      })

      afterAll(() => next.destroy())

      it('runs with no warning API route on the edge runtime', async () => {
        await next.start()
        const res = await fetchViaHTTP(next.url, `/api/edge`)
        expect(res.status).toEqual(200)
        expect(next.cliOutput).not.toInclude('error')
        expect(next.cliOutput).not.toInclude('warn')
      })

      it('warns about API route using experimental-edge runtime', async () => {
        await next.patchFile(
          apiPath,
          `
            export default () => new Response('ok');
            export const config = { runtime: 'experimental-edge' };
          `
        )
        await next.start()
        const res = await fetchViaHTTP(next.url, `/api/edge`)
        expect(res.status).toEqual(200)
        expect(next.cliOutput).not.toInclude('error')
        expect(stripAnsi(next.cliOutput)).toInclude(
          `/api/edge provided runtime 'experimental-edge'. It can be updated to 'edge' instead.`
        )
      })
      it('warns about page using edge runtime', async () => {
        await next.patchFile(
          pagePath,
          `
            export default () => (<p>hello world</p>);
            export const runtime = 'experimental-edge';
          `
        )
        await next.start()
        const res = await fetchViaHTTP(next.url, `/`)
        expect(res.status).toEqual(200)
        expect(next.cliOutput).not.toInclude('error')
        expect(stripAnsi(next.cliOutput)).toInclude(
          `You are using an experimental edge runtime, the API might change.`
        )
      })

      it('errors about page using edge runtime', async () => {
        await next.patchFile(
          pagePath,
          `
            export default () => (<p>hello world</p>);
            export const runtime = 'edge';
          `
        )
        await next.start()
        const res = await fetchViaHTTP(next.url, `/`)
        expect(res.status).toEqual(200)
        expect(stripAnsi(next.cliOutput)).toInclude(
          `Page / provided runtime 'edge', the edge runtime for rendering is currently experimental. Use runtime 'experimental-edge' instead.`
        )
        expect(next.cliOutput).not.toInclude('warn')
      })
    })
  } else if ((global as any).isNextStart) {
    describe('In start mode', () => {
      // TODO because createNext runs process.exit() without any log info on build failure, rely on good old nextBuild()
      afterEach(async () => {
        page.restore()
        api.restore()
      })

      it('builds with API route on the edge runtime and page on the experimental edge runtime', async () => {
        page.write(`
          export default () => (<p>hello world</p>);
          export const runtime = 'experimental-edge';
        `)
        const output = await nextBuild(appDir, undefined, {
          stdout: true,
          stderr: true,
        })
        expect(output.code).toBe(0)
        expect(output.stderr).not.toContain(`error`)
        expect(output.stdout).not.toContain(`warn`)
      })

      it('does not build with page on the edge runtime', async () => {
        page.write(`
          export default () => (<p>hello world</p>);
          export const runtime = 'edge';
        `)
        const output = await nextBuild(appDir, undefined, {
          stdout: true,
          stderr: true,
        })
        expect(output.code).toBe(1)
        expect(output.stderr).not.toContain(`Build failed`)
        expect(stripAnsi(output.stderr)).toContain(
          `Error: Page / provided runtime 'edge', the edge runtime for rendering is currently experimental. Use runtime 'experimental-edge' instead.`
        )
      })
    })
  } else {
    it.skip('no deploy tests', () => {})
  }
})
