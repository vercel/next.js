import { nextTestSetup } from 'e2e-utils'
import { check } from 'next-test-utils'

describe('app-invalid-revalidate', () => {
  const { next, isNextDev, skipped } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  it('should error properly for invalid revalidate at layout', async () => {
    await next.stop().catch(() => {})
    const origText = await next.readFile('app/layout.tsx')

    try {
      await next.patchFile(
        'app/layout.tsx',
        origText.replace('// export', 'export')
      )
      await next.start().catch(() => {})

      await check(async () => {
        if (isNextDev) {
          await next.fetch('/')
        }
        return next.cliOutput
      }, /Invalid revalidate value "1" on "\/", must be a non-negative number or false/)
    } finally {
      await next.patchFile('app/layout.tsx', origText)
    }
  })

  it('should error properly for invalid revalidate at page', async () => {
    await next.stop().catch(() => {})
    const origText = await next.readFile('app/page.tsx')

    try {
      await next.patchFile(
        'app/page.tsx',
        origText.replace('// export', 'export')
      )
      await next.start().catch(() => {})

      await check(async () => {
        if (isNextDev) {
          await next.fetch('/')
        }
        return next.cliOutput
      }, /Invalid revalidate value "1" on "\/", must be a non-negative number or false/)
    } finally {
      await next.patchFile('app/page.tsx', origText)
    }
  })

  it('should error properly for invalid revalidate on fetch', async () => {
    await next.stop().catch(() => {})
    const origText = await next.readFile('app/page.tsx')

    try {
      await next.patchFile(
        'app/page.tsx',
        origText.replace('// await', 'await')
      )
      await next.start().catch(() => {})

      await check(async () => {
        if (isNextDev) {
          await next.fetch('/')
        }
        return next.cliOutput
      }, /Invalid revalidate value "1" on "\/", must be a non-negative number or false/)
    } finally {
      await next.patchFile('app/page.tsx', origText)
    }
  })

  it('should error properly for invalid revalidate on unstable_cache', async () => {
    await next.stop().catch(() => {})
    const origText = await next.readFile('app/page.tsx')

    try {
      await next.patchFile(
        'app/page.tsx',
        origText.replace('// await unstable', 'await unstable')
      )
      await next.start().catch(() => {})

      await check(async () => {
        if (isNextDev) {
          await next.fetch('/')
        }
        return next.cliOutput
      }, /Invalid revalidate value "1" on "unstable_cache/)
    } finally {
      await next.patchFile('app/page.tsx', origText)
    }
  })
})
