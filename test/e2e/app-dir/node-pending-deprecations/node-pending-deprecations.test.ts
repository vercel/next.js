import { nextTestSetup } from 'e2e-utils'

describe('node-pending-deprecations', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    dependencies: {
      'pending-deprecation-fixture': 'file:./pending-deprecation-fixture',
    },
  })

  it('reports a pending deprecation from an external server module', async () => {
    const response = await next.fetch('/deprecated')
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      deprecation: {
        name: 'DeprecationWarning',
        code: 'DEP0144',
        message:
          'module.parent is deprecated due to accuracy issues. Please use require.main to find program entry point instead.',
      },
    })
  })
})
