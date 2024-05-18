import { nextTestSetup } from 'e2e-utils'

describe('app-dir metadata-json-manifest', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  it('should support metadata.json manifest', async () => {
    const response = await next.fetch('/manifest.json')
    expect(response.status).toBe(200)
    const json = await response.json()
    expect(json).toEqual({
      name: 'My Next.js Application',
      short_name: 'Next.js App',
      description: 'An application built with Next.js',
      start_url: '/',
    })
  })
})
