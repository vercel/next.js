import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

// Automatic tracking of directory reads only affects dev invalidation in Turbopack.
// @force-gate dev && turbopack
describe('webpack loader directory reads', () => {
  const { next } = nextTestSetup({
    nextConfig: {
      turbopack: {
        rules: {
          '*.listing': { loaders: ['./list-loader.cjs'], as: '*.js' },
        },
      },
    },
    files: {
      'pages/index.js': `
        import files from '../files.listing'
        export default function Page() {
          return <p id="files">{files}</p>
        }
      `,
      'files.listing': '',
      'entries/a.txt': '',
      'list-loader.cjs': `
        const path = require('node:path')

        module.exports = function () {
          const done = this.async()
          this.fs.readdir(path.join(this.rootContext, 'entries'), (err, names) => {
            if (err) return done(err)
            done(null, 'export default ' + JSON.stringify(names.sort().join(',')))
          })
        }
      `,
    },
  })

  it('updates the listing as files are added and removed', async () => {
    const readFiles = async () => (await next.render$('/'))('#files').text()

    expect(await readFiles()).toBe('a.txt')
    await next.patchFile('entries/b.txt', 'new file', async () => {
      await retry(async () => expect(await readFiles()).toBe('a.txt,b.txt'))
    })
    await retry(async () => expect(await readFiles()).toBe('a.txt'))
  })
})
