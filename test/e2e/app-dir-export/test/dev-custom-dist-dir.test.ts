import { join } from 'path'
import { FileRef, isNextDev, nextTestSetup, PatchedFileRef } from 'e2e-utils'

if (isNextDev) {
  describe('app dir - with output export and custom distDir in dev', () => {
    const { next } = nextTestSetup({
      files: {
        app: new FileRef(join(__dirname, '..', 'app')),
        'next.config.js': new PatchedFileRef(
          join(__dirname, '..', 'next.config.js'),
          (content) => content.replace('// distDir', 'distDir')
        ),
      },
    })

    it('should render properly in dev', async () => {
      expect(next.distDir).toContain('.next-custom')

      const res = await next.render('/')
      expect(res).toContain('Home')
    })
  })
}
