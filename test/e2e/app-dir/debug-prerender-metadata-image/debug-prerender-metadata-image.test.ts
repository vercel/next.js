import { nextTestSetup } from 'e2e-utils'

describe('debug-prerender-metadata-image', () => {
  const { next, isNextStart } = nextTestSetup({
    files: __dirname,
    // The bug only reproduces under --debug-prerender: plain `next build`
    // always classifies this route as static.
    buildArgs: ['--debug-prerender'],
  })

  // The classification flips between builds without the fix (about half of
  // identical cold builds land on dynamic), so one build is not a detector:
  // rebuild and assert the static classification every time.
  //
  // NOTE: each rebuild's output must be read from the `cliOutput` returned by
  // `next.build()` — `next.cliOutput` accumulates across builds (and is reset
  // by `next.start()`), so matching against it after a rebuild would keep
  // returning the first build's line. The server must also be stopped before
  // rebuilding (`next.build()` throws while it is running).
  it('should consistently classify a static ImageResponse metadata route as static under --debug-prerender', async () => {
    if (!isNextStart) return

    const assertBuild = (output: string) => {
      const [ogStatus] = output.match(/. \/opengraph-image/)
      expect(ogStatus).toBe('○ /opengraph-image')

      // Dynamic control: this route reads request data, so it must stay
      // dynamic after the fix.
      const [twitterStatus] = output.match(/. \/twitter-image/)
      expect(twitterStatus).toBe('ƒ /twitter-image')
    }

    // Initial build output (the only build so far).
    assertBuild(next.cliOutput)

    for (let i = 0; i < 2; i++) {
      await next.stop()
      // `buildArgs` from the setup already adds `--debug-prerender`.
      const { exitCode, cliOutput } = await next.build()
      expect(exitCode).toBe(0)
      assertBuild(cliOutput)
    }

    await next.start()

    const res = await next.fetch('/opengraph-image')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/png')

    const twitterRes = await next.fetch('/twitter-image')
    expect(twitterRes.status).toBe(200)
    expect(twitterRes.headers.get('content-type')).toBe('image/png')
  })
})
