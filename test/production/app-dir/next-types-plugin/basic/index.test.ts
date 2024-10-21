import { nextTestSetup } from 'e2e-utils'
;(process.env.TURBOPACK ? describe.skip : describe)('next-types-plugin', () => {
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
  it('should have type for dynamic page', async () => {
    expect(await next.hasFile('app/[dynamic]/page.tsx')).toBe(true)
    expect(await next.hasFile('.next/types/app/[dynamic]/page.ts')).toBe(true)
  })
  it('should have type for dynamic layout', async () => {
    expect(await next.hasFile('app/[dynamic]/layout.tsx')).toBe(true)
    expect(await next.hasFile('.next/types/app/[dynamic]/layout.ts')).toBe(true)
  })
})
