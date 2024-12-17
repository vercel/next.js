import { nextTestSetup } from 'e2e-utils'
import path from 'path'

describe('ppr-missing-root-params (single)', () => {
  const { next, isNextDev } = nextTestSetup({
    files: path.join(__dirname, 'fixtures/single'),
    skipStart: true,
    skipDeployment: true,
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

describe('ppr-missing-root-params (multiple)', () => {
  const { next, isNextDev } = nextTestSetup({
    files: path.join(__dirname, 'fixtures/multiple'),
    skipStart: true,
    skipDeployment: true,
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

describe('ppr-missing-root-params (nested)', () => {
  const { next, isNextDev } = nextTestSetup({
    files: path.join(__dirname, 'fixtures/nested'),
    skipStart: true,
    skipDeployment: true,
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
