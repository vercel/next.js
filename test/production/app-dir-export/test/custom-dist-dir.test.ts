import { join } from 'path'
import { FileRef, nextTestSetup, PatchedFileRef } from 'e2e-utils'

describe('app dir - with output export and custom distDir', () => {
  const { next, skipped } = nextTestSetup({
    files: {
      app: new FileRef(join(__dirname, '..', 'app')),
      'next.config.js': new PatchedFileRef(
        join(__dirname, '..', 'next.config.js'),
        (content) => content.replace('// distDir', 'distDir')
      ),
    },
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  it('should render properly', async () => {
    expect(next.distDir).toContain('.next-custom')

    const res = await next.render('/')
    expect(res).toContain('Home')
  })
})
