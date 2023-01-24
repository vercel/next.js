import path from 'path'
import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'export app dir',
  {
    files: __dirname,
  },
  ({ next }) => {
    const outdir = 'out'
    beforeAll(async () => {
      await next.stop()
      await next.export({ outdir })
    })

    const fileExists = (file: string) =>
      next
        .readFile(file)
        .then(() => true)
        .catch(() => false)

    it('export works', async () => {
      expect(await fileExists(path.join(outdir, 'index.html'))).toBeTrue()
    })

    it('pages in pages/ will get rendered', async () => {
      expect(await fileExists(path.join(outdir, 'page.html'))).toBeTrue()
    })
  }
)
