import { isNextDev, isNextStart, nextTestSetup } from 'e2e-utils'
import { join } from 'path'
import stripAnsi from 'strip-ansi'

const pagePath = 'pages/index.jsx'
const apiPath = 'pages/api/edge.js'

;(process.env.IS_TURBOPACK_TEST ? describe.skip.each : describe.each)([
  { appDir: join(__dirname, './app/src'), title: 'src/pages and API routes' },
  { appDir: join(__dirname, './app'), title: 'pages and API routes' },
])('Configurable runtime for $title', ({ appDir }) => {
  if (isNextDev) {
    describe('In development mode', () => {
      const { next } = nextTestSetup({
        files: appDir,
        skipStart: true,
      })

      let originalPage: string
      let originalApi: string

      beforeAll(async () => {
        originalPage = await next.readFile(pagePath)
        originalApi = await next.readFile(apiPath)
      })

      afterEach(async () => {
        await next.stop()
        await next.patchFile(pagePath, originalPage)
        await next.patchFile(apiPath, originalApi)
      })

      it('runs with no warning API route on the edge runtime', async () => {
        await next.start()
        const res = await next.fetch(`/api/edge`)
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
        const res = await next.fetch(`/api/edge`)
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
        const res = await next.fetch(`/`)
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
        const res = await next.fetch(`/`)
        expect(res.status).toEqual(200)
        expect(stripAnsi(next.cliOutput)).toInclude(
          `Page / provided runtime 'edge', the edge runtime for rendering is currently experimental. Use runtime 'experimental-edge' instead.`
        )
        expect(next.cliOutput).not.toInclude('warn')
      })
    })
  } else if (isNextStart) {
    describe('In start mode', () => {
      const { next } = nextTestSetup({
        files: appDir,
        skipStart: true,
      })

      let originalPage: string
      let originalApi: string

      beforeAll(async () => {
        originalPage = await next.readFile(pagePath)
        originalApi = await next.readFile(apiPath)
      })

      afterEach(async () => {
        await next.patchFile(pagePath, originalPage)
        await next.patchFile(apiPath, originalApi)
      })

      it('builds with API route on the edge runtime and page on the experimental edge runtime', async () => {
        await next.patchFile(
          pagePath,
          `
          export default () => (<p>hello world</p>);
          export const runtime = 'experimental-edge';
        `
        )
        const { exitCode, cliOutput } = await next.build()
        expect(exitCode).toBe(0)
        expect(cliOutput).not.toContain(`error`)
        expect(cliOutput).not.toContain(`warn`)
      })

      it('does not build with page on the edge runtime', async () => {
        await next.patchFile(
          pagePath,
          `
          export default () => (<p>hello world</p>);
          export const runtime = 'edge';
        `
        )
        const { exitCode, cliOutput } = await next.build()
        expect(exitCode).toBe(1)
        expect(cliOutput).not.toContain(`Build failed`)
        expect(stripAnsi(cliOutput)).toContain(
          `Error: Page / provided runtime 'edge', the edge runtime for rendering is currently experimental. Use runtime 'experimental-edge' instead.`
        )
      })
    })
  } else {
    it.skip('no deploy tests', () => {})
  }
})
