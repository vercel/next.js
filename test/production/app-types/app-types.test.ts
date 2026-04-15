import { nextTestSetup } from 'e2e-utils'

describe('app type checking - production mode', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  let errors: string | undefined

  beforeAll(async () => {
    await next.build()
    const stderr = next.cliOutput

    errors = stderr.match(
      /===== TS errors =====(.+)===== TS errors =====/s
    )?.[1]
  })

  it('should report link errors', async () => {
    const dts = await next.readFile('.next/types/link.d.ts')
    expect(dts.includes('`/dashboard/user/')).toBeTruthy()
    expect(dts.includes('`/dashboard/another')).toBeTruthy()

    expect(errors).toContain(
      'Type error: "/(newroot)/dashboard/another" is not an existing route. If it is intentional, please type it explicitly with `as Route`.'
    )

    const errorLines = [
      ...errors!.matchAll(/\.\/src\/app\/type-checks\/link\/page\.tsx:(\d+):/g),
    ].map(([, line]) => +line)

    const ST = 18
    const ED = 35
    expect(errorLines).toEqual(
      Array.from({ length: ED - ST + 1 }, (_, i) => i + ST)
    )
  })

  it('should generate route types correctly and report router API errors', async () => {
    const errorLines = [
      ...errors!.matchAll(
        /\.\/src\/app\/type-checks\/router\/page\.tsx:(\d+):/g
      ),
    ].map(([, line]) => +line)

    const ST = 11
    const ED = 13
    expect(errorLines).toEqual(
      Array.from({ length: ED - ST + 1 }, (_, i) => i + ST)
    )
  })

  it('should generate route types correctly and report form errors', async () => {
    const errorLines = [
      ...errors!.matchAll(/\.\/src\/app\/type-checks\/form\/page\.tsx:(\d+):/g),
    ].map(([, line]) => +line)

    const ST = 8
    const ED = 10
    expect(errorLines).toEqual(
      Array.from({ length: ED - ST + 1 }, (_, i) => i + ST)
    )
  })

  it('should generate route types correctly and report redirect errors', async () => {
    const errorLines = [
      ...errors!.matchAll(
        /\.\/src\/app\/type-checks\/redirect\/page\.tsx:(\d+):/g
      ),
    ].map(([, line]) => +line)

    const ST = 7
    const ED = 11
    expect(errorLines).toEqual(
      Array.from({ length: ED - ST + 1 }, (_, i) => i + ST)
    )
  })

  if (!process.env.IS_TURBOPACK_TEST && !process.env.TURBOPACK_DEV) {
    it('should type check invalid entry exports', () => {
      expect(errors).toContain(`"foo" is not a valid Page export field.`)

      expect(errors).toMatch(
        /Invalid configuration "revalidate":\s+Expected "false | number \(>= 0\)", got "-1"/
      )

      expect(errors).toMatch(
        /Page "src\/app\/type-checks\/config\/page\.tsx" has an invalid "default" export:\s+Type "{ foo: string; }" is not valid/
      )
      expect(errors).toMatch(
        /Page "src\/app\/type-checks\/config\/page\.tsx" has an invalid "generateMetadata" export:\s+Type "{ s: number; }" is not valid/
      )
      expect(errors).toMatch(
        /Page "src\/app\/type-checks\/config\/page\.tsx" has an invalid "generateStaticParams" export:\s+Type "string" is not valid/
      )

      expect(errors).toContain(
        `"Promise<number>" is not a valid generateStaticParams return type`
      )

      expect(errors).toContain(`"bar" is not a valid Route export field.`)

      expect(errors).toMatch(
        /Invalid configuration "revalidate":\s+Expected "false | number \(>= 0\)", got "-1"/
      )

      expect(errors).toMatch(
        /Route "src\/app\/type-checks\/route-handlers\/route\.ts" has an invalid "GET" export:\s+Type "boolean" is not a valid type for the function's first argument/
      )
      expect(errors).toMatch(
        /Route "src\/app\/type-checks\/route-handlers\/route\.ts" has an invalid "generateStaticParams" export:\s+Type "string" is not valid/
      )

      expect(errors).toContain(
        `"Promise<boolean>" is not a valid generateStaticParams return type`
      )
    })
  }
})
