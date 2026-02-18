import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('cache-life-types', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  it('should emit cache-life types', async () => {
    await retry(async () => {
      const content = await next.readFile(
        `${next.distDir}/types/cache-life.d.ts`
      )

      expect(content).toContain(
        'export function cacheLife(profile: "frequent"): void'
      )
    })
  })
})
