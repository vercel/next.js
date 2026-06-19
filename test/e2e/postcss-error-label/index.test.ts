import { nextTestSetup } from 'e2e-utils'
import { waitForRedbox, getRedboxSource } from 'next-test-utils'

const postcssLabel =
  'Generated code of PostCSS transform of file content of app/styles.module.css:'

describe('postcss error labels (development)', () => {
  const { next, isNextDev, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
    skipStart: true,
  })

  if (skipped) {
    return
  }

  if (!isNextDev) {
    it('skipped in production mode', () => {})
    return
  }

  beforeAll(() => next.start())

  it('keeps the PostCSS label when a config applies', async () => {
    const browser = await next.browser('/')

    await waitForRedbox(browser)
    const source = await getRedboxSource(browser)

    expect(source).toContain('Parsing CSS source code failed')
    expect(source).toContain(postcssLabel)
  })
})

describe('postcss error labels (production)', () => {
  const { next, isNextStart } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
    skipStart: true,
  })

  if (!isNextStart) {
    it('skipped in development mode', () => {})
    return
  }

  it('keeps the PostCSS label when a config applies', async () => {
    await expect(next.start()).rejects.toThrow(
      'next build failed with code/signal 1'
    )

    expect(next.cliOutput).toContain('Parsing CSS source code failed')
    expect(next.cliOutput).toContain(postcssLabel)
  })
})
