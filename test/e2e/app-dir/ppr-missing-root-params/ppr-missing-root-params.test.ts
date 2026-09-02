import { nextTestSetup } from 'e2e-utils'
import path from 'path'

// TODO(deploy-test-completion): Re-enable this suite in deploy mode.
// It likely expects a local build failure instead of a successful deployment.
// @force-gate !deploy
describe('ppr-missing-root-params (single)', () => {
  const { next, isNextDev } = nextTestSetup({
    files: path.join(__dirname, 'fixtures/single'),
    skipStart: true,
  })

  beforeAll(async () => {
    try {
      await next.start()
    } catch {}
  })

  it('should result in a build error', async () => {
    if (isNextDev) {
      await next.fetch('/en')
    }

    expect(next.cliOutput).toContain(
      `Error: A required root parameter (lang) was not provided in generateStaticParams for /[lang], please provide at least one value.`
    )
  })
})

// TODO(deploy-test-completion): Re-enable this suite in deploy mode.
// It likely expects a local build failure instead of a successful deployment.
// @force-gate !deploy
describe('ppr-missing-root-params (multiple)', () => {
  const { next, isNextDev } = nextTestSetup({
    files: path.join(__dirname, 'fixtures/multiple'),
    skipStart: true,
  })

  beforeAll(async () => {
    try {
      await next.start()
    } catch {}
  })

  it('should result in a build error', async () => {
    if (isNextDev) {
      await next.fetch('/en/us')
    }

    expect(next.cliOutput).toContain(
      `Error: Required root params (lang, region) were not provided in generateStaticParams for /[lang]/[region], please provide at least one value for each.`
    )
  })
})

// TODO(deploy-test-completion): Re-enable this suite in deploy mode.
// It likely expects a local build failure instead of a successful deployment.
// @force-gate !deploy
describe('ppr-missing-root-params (nested)', () => {
  const { next, isNextDev } = nextTestSetup({
    files: path.join(__dirname, 'fixtures/nested'),
    skipStart: true,
  })

  beforeAll(async () => {
    try {
      await next.start()
    } catch {}
  })

  it('should result in a build error', async () => {
    if (isNextDev) {
      await next.fetch('/en/blog/hello')
    }

    expect(next.cliOutput).toContain(
      `Error: A required root parameter (lang) was not provided in generateStaticParams for /[lang]/blog/[slug], please provide at least one value.`
    )
  })
})
