import { nextTestSetup } from 'e2e-utils'
;(process.env.TURBOPACK ? describe.skip : describe)(
  'next-types-plugin private-folder-convention',
  () => {
    const { next, skipped } = nextTestSetup({
      files: __dirname,
      skipDeployment: true,
    })

    if (skipped) return

    it('should have type for root page', async () => {
      expect(await next.hasFile('app/page.tsx')).toBe(true)
      expect(await next.hasFile('.next/types/app/page.ts')).toBe(true)
    })
    it('should have type for root layout', async () => {
      expect(await next.hasFile('app/layout.tsx')).toBe(true)
      expect(await next.hasFile('.next/types/app/layout.ts')).toBe(true)
    })
    it('should have type for nested page', async () => {
      expect(await next.hasFile('app/nested/page.tsx')).toBe(true)
      expect(await next.hasFile('.next/types/app/nested/page.ts')).toBe(true)
    })
    it('should have type for nested layout', async () => {
      expect(await next.hasFile('app/nested/layout.tsx')).toBe(true)
      expect(await next.hasFile('.next/types/app/nested/layout.ts')).toBe(true)
    })

    it('should not have type for root page in private folder', async () => {
      expect(await next.hasFile('app/_private/page.tsx')).toBe(true)
      expect(await next.hasFile('.next/types/app/_private/page.ts')).toBe(false)
    })
    it('should not have type for root layout in private folder', async () => {
      expect(await next.hasFile('app/_private/layout.tsx')).toBe(true)
      expect(await next.hasFile('.next/types/app/_private/layout.ts')).toBe(
        false
      )
    })
    it('should not have type for nested page in private folder', async () => {
      expect(await next.hasFile('app/nested/_private/page.tsx')).toBe(true)
      expect(
        await next.hasFile('.next/types/app/nested/_private/page.ts')
      ).toBe(false)
    })
    it('should not have type for nested layout in private folder', async () => {
      expect(await next.hasFile('app/nested/_private/layout.tsx')).toBe(true)
      expect(
        await next.hasFile('.next/types/app/nested/_private/layout.ts')
      ).toBe(false)
    })
  }
)
