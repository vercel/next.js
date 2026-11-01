import { FileRef, nextTestSetup } from 'e2e-utils'

// DEP0144: the TypeScript config loader reads module.parent in requireFromString,
// so --throw-deprecation prevents this fixture from building or starting.
// @force-gate !futureCompat
describe('specified tsconfig', () => {
  const { next } = nextTestSetup({
    files: new FileRef(__dirname),
    dependencies: {
      typescript: '5.4.4',
    },
  })

  it('app router: allows a user-specific tsconfig via the next config', async () => {
    const html = await next.render('/')
    expect(html).toContain('bar123')
  })

  it('pages router: allows a user-specific tsconfig via the next config', async () => {
    const html = await next.render('/page')
    expect(html).toContain('bar123')
  })

  it('middleware: allows a user-specific tsconfig via the next config', async () => {
    const html = await next.render('/middleware')
    expect(html).toContain('bar123')
  })
})
