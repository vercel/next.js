import { nextTestSetup, isNextDev, isNextStart } from 'e2e-utils'
;((isNextDev && process.env.TURBOPACK_BUILD) ||
  (isNextStart && process.env.TURBOPACK_DEV)
  ? describe.skip
  : describe)('Relay Compiler Transform - Single Project Config', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    dependencies: {
      'relay-compiler': '13.0.2',
      'relay-runtime': '13.0.2',
      '@types/relay-runtime': 'latest',
    },
    // Relay expects the project root to contain relay.config.js. Run the compiler
    // after install so generated artifacts match the schema before dev/start.
    installCommand: 'pnpm install && npx relay-compiler',
  })

  it('should resolve index page correctly', async () => {
    const html = await next.render('/')
    expect(html).toContain('Hello, World!')
  })
})
