import { nextTestSetup } from 'e2e-utils'

const validPage = `export default function Page() {
  return <p>hello</p>
}`

describe('use-cache-invalid-cache-life', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    skipDeployment: true,
  })

  if (skipped) return

  it('fails the build for a config profile with a non-finite value other than Infinity', async () => {
    await next.patchFile(
      'next.config.js',
      `module.exports = {
        cacheComponents: true,
        cacheLife: {
          invalid: { revalidate: -Infinity },
        },
      }`
    )
    await next.patchFile('app/page.tsx', validPage)

    const { exitCode, cliOutput } = await next.build()
    expect(exitCode).not.toBe(0)
    expect(cliOutput).toContain(
      'Invalid "cacheLife.invalid.revalidate" provided, expected a finite number of seconds or Infinity, received -Infinity'
    )
  })

  it('fails the build for a config profile with a revalidate longer than its expire', async () => {
    await next.patchFile(
      'next.config.js',
      `module.exports = {
        cacheComponents: true,
        cacheLife: {
          inconsistent: { revalidate: 100, expire: 50 },
        },
      }`
    )
    await next.patchFile('app/page.tsx', validPage)

    const { exitCode, cliOutput } = await next.build()
    expect(exitCode).not.toBe(0)
    expect(cliOutput).toContain(
      'the expire option must be greater than the revalidate option'
    )
  })

  it('does not fail the build for a partial default profile whose backfilled revalidate is longer than its expire', async () => {
    await next.patchFile(
      'next.config.js',
      `module.exports = {
        cacheComponents: true,
        cacheLife: {
          default: { expire: 0 },
        },
      }`
    )
    await next.patchFile('app/page.tsx', validPage)

    const { exitCode } = await next.build()
    expect(exitCode).toBe(0)
  })

  it('fails the build for an inline cacheLife() profile with a non-finite value other than Infinity', async () => {
    await next.patchFile(
      'next.config.js',
      `module.exports = {
        cacheComponents: true,
      }`
    )
    await next.patchFile(
      'app/page.tsx',
      `import { cacheLife } from 'next/cache'

      export default async function Page() {
        'use cache'
        cacheLife({ expire: NaN })

        return <p>never rendered</p>
      }`
    )

    const { exitCode, cliOutput } = await next.build()
    expect(exitCode).not.toBe(0)
    expect(cliOutput).toContain(
      'Invalid `cacheLife()` option "expire" provided, expected a finite number of seconds or Infinity, received NaN.'
    )
  })
})
