import { isNextStart, nextTestSetup } from 'e2e-utils'

describe('app-dir ISR notFound static files', () => {
  if (!isNextStart || process.env.__NEXT_CACHE_COMPONENTS) {
    it('skipped outside next start or with cache components', () => {})
    return
  }

  const { next, skipped } = nextTestSetup({
    files: __dirname,
    buildCommand: 'node node_modules/next/dist/bin/next build',
    startCommand: 'node node_modules/next/dist/bin/next start',
    skipDeployment: true,
  })

  if (skipped) return

  const missingArtifacts = [
    '.next/server/app/isr-not-found/missing.html',
    '.next/server/app/isr-not-found/missing.rsc',
    '.next/server/app/isr-not-found/missing.meta',
    '.next/server/app/isr-not-found/missing.segments',
  ]

  it('does not persist generated notFound() ISR responses to disk', async () => {
    expect(
      await next.hasFile('.next/server/app/isr-not-found/valid.html')
    ).toBe(true)

    for (const artifact of missingArtifacts) {
      expect(await next.hasFile(artifact)).toBe(false)
    }

    const firstResponse = await next.fetch('/isr-not-found/missing')
    expect(firstResponse.status).toBe(404)
    expect(await firstResponse.text()).toContain('This page could not be found')

    for (const artifact of missingArtifacts) {
      expect(await next.hasFile(artifact)).toBe(false)
    }

    const secondResponse = await next.fetch('/isr-not-found/missing')
    expect(secondResponse.status).toBe(404)
    expect(secondResponse.headers.get('x-nextjs-cache')).toBe('HIT')

    for (const artifact of missingArtifacts) {
      expect(await next.hasFile(artifact)).toBe(false)
    }
  })
})
