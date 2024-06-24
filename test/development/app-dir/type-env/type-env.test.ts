import { nextTestSetup } from 'e2e-utils'
import { check } from 'next-test-utils'

describe('type-env', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should have env.d.ts file', async () => {
    expect(await next.hasFile('.next/types/env.d.ts')).toBe(true)
  })

  it('should have env types from next config', async () => {
    expect(await next.readFile('.next/types/env.d.ts')).toInclude(
      'FROM_NEXT_CONFIG: readonly string'
    )
  })

  it('should have env types from .env.development.local', async () => {
    expect(await next.readFile('.next/types/env.d.ts')).toInclude(
      'FROM_DEV_ENV_LOCAL: readonly string'
    )
  })

  it('should have env types from .env.local', async () => {
    expect(await next.readFile('.next/types/env.d.ts')).toInclude(
      'FROM_ENV_LOCAL: readonly string'
    )
  })

  it('should have env types from .env', async () => {
    expect(await next.readFile('.next/types/env.d.ts')).toInclude(
      'FROM_ENV: readonly string'
    )
  })

  it('should rewrite env types if .env is modified', async () => {
    expect(await next.hasFile('.env')).toBe(true)
    await next.patchFile('.env', 'MODIFIED_ENV="MODIFIED_ENV"')

    expect(
      await check(
        async () => await next.readFile('.next/types/env.d.ts'),
        /MODIFIED_ENV/
      )
    ).toBe(true)

    expect(await next.readFile('.next/types/env.d.ts')).not.toInclude(
      'FROM_ENV: readonly string'
    )
  })

  it('should NOT have env types from .env.production.local', async () => {
    expect(await next.readFile('.next/types/env.d.ts')).not.toInclude(
      'FROM_PROD_ENV_LOCAL: readonly string'
    )
  })
})
