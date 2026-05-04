import path from 'path'
import { FileRef, nextTestSetup } from 'e2e-utils'

describe('tsconfig inheriting from outside Next.js directory', () => {
  const fixtureDir = path.join(__dirname, 'fixtures/inherited')
  const { next } = nextTestSetup({
    files: {
      '../tsconfig.base.json': new FileRef(
        path.join(fixtureDir, 'tsconfig.base.json')
      ),
      'next.config.js': new FileRef(
        path.join(fixtureDir, 'web/next.config.js')
      ),
      'tsconfig.json': new FileRef(path.join(fixtureDir, 'web/tsconfig.json')),
      app: new FileRef(path.join(fixtureDir, 'web/app')),
    },
    subDir: 'web',
  })

  it('should render the page that uses the aliased module', async () => {
    const html = await next.render('/')
    expect(html).toContain('Hello, Dave!')
  })
})
