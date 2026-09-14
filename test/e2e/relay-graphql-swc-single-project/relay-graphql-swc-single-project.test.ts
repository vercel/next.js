import { nextTestSetup } from 'e2e-utils'
import execa from 'execa'

describe('Relay Compiler Transform - Single Project Config', () => {
  const { next, isNextDeploy } = nextTestSetup({
    files: __dirname,
    dependencies: {
      'relay-compiler': '21.0.1',
      'relay-runtime': '21.0.1',
      '@types/relay-runtime': '20.1.1',
    },
  })

  ;(isNextDeploy ? it.skip : it)('has up-to-date graphql types', async () => {
    await execa('pnpm', ['exec', 'relay-compiler', '--validate'], {
      cwd: next.testDir,
      stdout: 'inherit',
      stderr: 'inherit',
    })
  })

  it('should resolve index page correctly', async () => {
    const html = await next.render('/')
    expect(html).toContain('Hello, World!')
  })
})
