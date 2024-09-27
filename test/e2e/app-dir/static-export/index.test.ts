import { nextTestSetup } from 'e2e-utils'

describe('app-dir generateStaticParams - next export', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
    skipStart: true,
  })
  if (skipped) return
  it('should error when `generateStaticParams` returns empty array', async () => {
    const out = await next.build()

    expect(out.exitCode).toBe(1)
    expect(out.cliOutput).toInclude(
      `returned an empty array in "generateStaticParams()", it is not allowed on "output: export" config.`
    )
  })

  it('should error when `generateStaticParams` is not defined', async () => {
    await next.patchFile(
      'app/[slug]/page.js',
      `
export default function Page({ params }) {
  return <div>{params.slug}</div>
}
`
    )

    const out = await next.build()
    expect(out.exitCode).toBe(1)
    expect(out.cliOutput).toInclude(
      `is missing "generateStaticParams()" so it cannot be used with "output: export" config.`
    )
  })
})
