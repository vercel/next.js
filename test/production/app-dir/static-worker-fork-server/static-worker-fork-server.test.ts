import { nextTestSetup } from 'e2e-utils'

const brokenPage = `
export default function Page() {
  throw new Error('static-worker-fork-server: broken page')
}
`

// With Turbopack, `next build` spawns the static workers through a fork server
// (a small helper process started before compiling) instead of forking the
// main process. Static generation must behave the same either way.
describe('static-worker-fork-server', () => {
  const { next, isTurbopack } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  const usesForkServer = isTurbopack && process.platform !== 'win32'

  it('prerenders pages and forwards worker output', async () => {
    const { exitCode, cliOutput } = await next.build()
    expect(exitCode).toBe(0)

    for (const id of ['1', '2', '3', '4', '5', '6']) {
      const html = await next.readFile(`.next/server/app/posts/${id}.html`)
      expect(html).toContain(`post <!-- -->${id}`)
      expect(cliOutput).toContain(
        `static-worker-fork-server: prerendering post ${id}`
      )
      expect(cliOutput).toContain(
        `static-worker-fork-server: stderr for post ${id}`
      )
    }

    if (process.platform === 'linux') {
      expect(cliOutput).toContain(
        `static-worker-fork-server: spawned by fork server ${usesForkServer}`
      )
      expect(cliOutput).not.toContain(
        `static-worker-fork-server: spawned by fork server ${!usesForkServer}`
      )
    }

    const trace = await next.readFile('.next/trace')
    if (usesForkServer) {
      expect(trace).toContain('"start-static-worker-fork-server"')
    } else {
      expect(trace).not.toContain('"start-static-worker-fork-server"')
    }

    await next.start()
    const $ = await next.render$('/posts/3')
    expect($('p').text()).toBe('post 3')
    await next.stop()
  })

  it('reports prerender errors and fails the build', async () => {
    await next.patchFile('app/broken/page.tsx', brokenPage, async () => {
      const { exitCode, cliOutput } = await next.build()
      expect(exitCode).toBe(1)
      expect(cliOutput).toContain('Error occurred prerendering page "/broken"')
      expect(cliOutput).toContain('static-worker-fork-server: broken page')
    })
  })
})
