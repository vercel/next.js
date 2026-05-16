import { nextTestSetup } from 'e2e-utils'

describe('turbopack-reports', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    dependencies: {
      sqlite3: '5.1.7',
    },
    packageJson: {
      pnpm: {
        onlyBuiltDependencies: ['sqlite3'],
      },
    },
  })

  it('should render page importing sqlite3', async () => {
    const $ = await next.render$('/sqlite-import-5913')
    expect($('#message').text()).toBe('Hello World')
  })
})
