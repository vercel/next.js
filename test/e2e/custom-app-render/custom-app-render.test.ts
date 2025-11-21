import { nextTestSetup } from 'e2e-utils'

describe('custom-app-render', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
    startCommand: 'node server.js',
    serverReadyPattern: /Next mode: (production|development)/,
    dependencies: {
      'get-port': '5.1.1',
    },
  })

  if (skipped) {
    return
  }

  it.each(['/', '/render'])('should render %s', async (page) => {
    const $ = await next.render$(page)
    expect($('#page').data('page')).toBe(page)
  })
})
