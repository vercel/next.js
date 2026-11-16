import { nextTestSetup } from 'e2e-utils'
import { waitForNoRedbox } from '../../../lib/next-test-utils'
import * as path from 'node:path'

// This tests compilation and doesn't need to run in deploy.
// @force-gate !deploy
describe('generated server actions entrypoint compiles correctly when package.json has `"type": "commonjs"`', () => {
  // This fixture reproduces a bug where setting `"type": "commonjs"` in
  // package.json would make turbopack error when compiling the generated server
  // actions entrypoint file.
  // Note that pages use `.mjs` so that ESM syntax is allowed --
  // there's currently no `.mtsx` extension that we can use to have JSX and ESM
  // work in a typescript file, so we have to use JS instead.

  const { next, isNextStart } = nextTestSetup({
    files: path.join(__dirname, 'fixtures/server-action'),
    skipStart: true,
  })

  if (isNextStart) {
    it('does not error during build', async () => {
      const result = await next.build()
      expect(result.exitCode).toBe(0)
    })
  } else {
    beforeAll(async () => {
      await next.start()
    })
    // In dev, we need to visit the page to trigger compilation.
    // @force-gate dev
    it('does not error in dev', async () => {
      const browser = await next.browser('/')
      await waitForNoRedbox(browser)
    })
  }
})

// This tests compilation and doesn't need to run in deploy.
// @force-gate !deploy
describe('nested package.json can override `"type": "commonjs"` in root package.json', () => {
  const { next, isNextStart } = nextTestSetup({
    files: path.join(__dirname, 'fixtures/nested-package-json'),
    skipStart: true,
  })

  if (isNextStart) {
    it('does not error during build', async () => {
      const result = await next.build()
      expect(result.exitCode).toBe(0)
    })
  } else {
    beforeAll(async () => {
      await next.start()
    })
    // In dev, we need to visit the page to trigger compilation.
    // @force-gate dev
    it('does not error in dev', async () => {
      const browser = await next.browser('/')
      await waitForNoRedbox(browser)
    })
  }
})
