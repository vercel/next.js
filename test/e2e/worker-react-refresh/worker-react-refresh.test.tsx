import { nextTestSetup } from 'e2e-utils'

describe('worker-react-refresh', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
    dependencies: require('./package.json').dependencies,
  })

  if (skipped) {
    return
  }

  it('does not cause any runtime errors', async () => {
    const pageErrors: unknown[] = []
    await next.browser('/', {
      beforePageLoad: (page) => {
        page.on('pageerror', (error: unknown) => {
          pageErrors.push(error)
        })
      },
    })

    // If the worker runtime does not implement the React Refresh API (i.e.
    // `register` and `signature`), transformed React code attempts to call it
    // and fails.
    expect(pageErrors).toBeEmpty()
  })
})
