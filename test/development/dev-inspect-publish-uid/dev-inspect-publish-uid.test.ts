import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('dev-inspect-publish-uid', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    // Next.js's own `--inspect` enables the inspector in the server process
    // only. A random port keeps parallel runs from colliding.
    startArgs: ['--inspect', '0'],
    env: { NODE_OPTIONS: '--inspect-publish-uid=stderr' },
  })

  it('keeps an inherited --inspect-publish-uid=stderr for the server inspector', async () => {
    let address = ''
    await retry(() => {
      const match = /Debugger listening on ws:\/\/([^/]+)\//.exec(
        next.cliOutput
      )
      expect(match).not.toBeNull()
      address = match![1]
    })

    // The debugger id is only published on stderr, not over HTTP.
    const res = await fetch(`http://${address}/json/list`)
    expect(res.status).toBe(404)

    expect(await next.render('/')).toContain('hello world')
  })
})
