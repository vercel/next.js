import { nextTestSetup } from 'e2e-utils'

describe('app-dir generateStaticParams - next export', () => {
  const { next, skipped, isNextStart } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
    skipStart: true,
  })
  if (skipped) return
  if (!isNextStart) {
    it('should skip for non-next start', () => {})
    return
  }

  it('should be successful even if `generateStaticParams` return empty array', async () => {
    const out = await next.build()
    expect(out.exitCode).toBe(0)
  })

  it('should be failed', async () => {
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
  })
})
