import { nextTestSetup } from 'e2e-utils'

describe('param-matching-empty-static-params', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  afterEach(async () => {
    await next.stop()
  })

  function build(route: string) {
    return next.build({
      args: ['--debug-build-paths', `app/${route}/page.tsx`],
    })
  }

  it.each(['blocking', 'fallback', 'dynamic'])(
    'builds a route whose only parameter is %s when generateStaticParams returns no params',
    async (mode) => {
      const { exitCode } = await build(`${mode}/[slug]`)
      expect(exitCode).toBe(0)
    }
  )

  it.each([
    ['a closed parameter', 'closed/[slug]'],
    ['a parameter without a matching mode', 'partial/[top]/[slug]'],
  ])(
    'fails the build when generateStaticParams returns no params for %s',
    async (_, route) => {
      const { exitCode, cliOutput } = await build(route)
      expect(exitCode).toBe(1)
      expect(cliOutput).toContain(
        'all `generateStaticParams` functions must return at least one result'
      )
    }
  )

  it('serves a blocking route that has no build-time params', async () => {
    const { exitCode } = await build('blocking/[slug]')
    expect(exitCode).toBe(0)
    await next.start({ skipBuild: true })
    const $ = await next.render$('/blocking/first')
    expect($('#slug').text()).toBe('first')
  })
})
