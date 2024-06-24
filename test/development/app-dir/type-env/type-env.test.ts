import { nextTestSetup } from 'e2e-utils'
import { check } from 'next-test-utils'

describe('type-env', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  let envDts: string

  beforeAll(async () => {
    envDts = await next.readFile('.next/types/env.d.ts')
  })

  it('should have env types from next config', async () => {
    expect(envDts).toInclude('FROM_NEXT_CONFIG: readonly string')
  })

  it('should have env types from .env.development.local', async () => {
    expect(envDts).toInclude('FROM_DEV_ENV_LOCAL: readonly string')
  })

  it('should have env types from .env.local', async () => {
    expect(envDts).toInclude('FROM_ENV_LOCAL: readonly string')
  })

  it('should have env types from .env', async () => {
    expect(envDts).toInclude('FROM_ENV: readonly string')
  })

  it('should NOT have env types from .env.production.local', async () => {
    expect(envDts).not.toInclude('FROM_PROD_ENV_LOCAL: readonly string')
  })

  it('should rewrite env types if .env is modified', async () => {
    // env.d.ts is written from original .env
    expect(await next.readFile('.next/types/env.d.ts')).toInclude(
      'FROM_ENV: readonly string'
    )

    // modify .env
    await next.patchFile('.env', 'MODIFIED_ENV="MODIFIED_ENV"')

    // env.d.ts should be rewritten
    expect(
      await check(
        async () => await next.readFile('.next/types/env.d.ts'),
        /MODIFIED_ENV/
      )
    ).toBe(true)

    // original .env content is not in env.d.ts
    expect(await next.readFile('.next/types/env.d.ts')).not.toInclude(
      'FROM_ENV: readonly string'
    )
  })
})
