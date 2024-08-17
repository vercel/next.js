import { nextTestSetup } from 'e2e-utils'

describe('no-react', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    installCommand: 'pnpm remove react react-dom',
  })

  it('should not have react or react-dom in the package.json', async () => {
    const packageJson = await next.readJSON('package.json')
    expect(packageJson.dependencies).toHaveProperty('next')
    expect(packageJson.dependencies).not.toHaveProperty('react')
    expect(packageJson.dependencies).not.toHaveProperty('react-dom')
  })

  it('should work using cheerio without react, react-dom', async () => {
    const $ = await next.render$('/')
    expect($('p').text()).toBe('hello world')
  })
})
