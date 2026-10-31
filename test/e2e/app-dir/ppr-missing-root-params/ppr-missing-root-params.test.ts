import { nextTestSetup } from 'e2e-utils'
import path from 'path'

describe('ppr-missing-root-params (single)', () => {
  const { next, isNextDev } = nextTestSetup({
    files: path.join(__dirname, 'fixtures/single'),
    skipStart: true,
  })

  it('should result in a build error', async () => {
    if (isNextDev) {
      await next.start()
      await next.fetch('/en')
    } else {
      await expect(next.start()).rejects.toThrow()
    }

    expect(next.cliOutput).toContain(
      `Error: A required root parameter (lang) was not provided in generateStaticParams for /[lang], please provide at least one value.`
    )
  }, 240_000)
})

describe('ppr-missing-root-params (multiple)', () => {
  const { next, isNextDev } = nextTestSetup({
    files: path.join(__dirname, 'fixtures/multiple'),
    skipStart: true,
  })

  it('should result in a build error', async () => {
    if (isNextDev) {
      await next.start()
      await next.fetch('/en/us')
    } else {
      await expect(next.start()).rejects.toThrow()
    }

    expect(next.cliOutput).toContain(
      `Error: Required root params (lang, region) were not provided in generateStaticParams for /[lang]/[region], please provide at least one value for each.`
    )
  }, 240_000)
})

describe('ppr-missing-root-params (nested)', () => {
  const { next, isNextDev } = nextTestSetup({
    files: path.join(__dirname, 'fixtures/nested'),
    skipStart: true,
  })

  it('should result in a build error', async () => {
    if (isNextDev) {
      await next.start()
      await next.fetch('/en/blog/hello')
    } else {
      await expect(next.start()).rejects.toThrow()
    }

    expect(next.cliOutput).toContain(
      `Error: A required root parameter (lang) was not provided in generateStaticParams for /[lang]/blog/[slug], please provide at least one value.`
    )
  }, 240_000)
})
