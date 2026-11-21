import { nextTestSetup } from 'e2e-utils'
import execa from 'execa'

describe('next/jest with images.loaderFile', () => {
  const { next } = nextTestSetup({
    skipStart: true,
    files: {
      'next.config.js': `
        module.exports = {
          images: {
            loaderFile: './image-loader.js',
          },
        }
      `,
      'image-loader.js': `
        export default function myLoader({ src, width, quality }) {
          return 'https://cdn.example.com/custom' + src + '?w=' + width + '&q=' + (quality || 75)
        }
      `,
      'components/avatar.js': `
        import Image from 'next/image'

        export default function Avatar() {
          return <Image src="/me.png" alt="me" width={100} height={100} />
        }
      `,
      'pages/index.js': `
        import Avatar from '../components/avatar'

        export default function Page() {
          return <Avatar />
        }
      `,
      'jest.config.js': `
        const nextJest = require('next/jest')

        const createJestConfig = nextJest({ dir: './' })

        module.exports = createJestConfig({
          testEnvironment: 'node',
        })
      `,
      'tests/avatar.test.js': `
        import { renderToString } from 'react-dom/server'
        import Avatar from '../components/avatar'

        it('uses the custom loader from images.loaderFile', () => {
          const html = renderToString(<Avatar />)
          expect(html).toContain('src="https://cdn.example.com/custom/me.png?w=256&amp;q=75"')
          expect(html).toContain('https://cdn.example.com/custom/me.png?w=128&amp;q=75 1x')
          expect(html).toContain('https://cdn.example.com/custom/me.png?w=256&amp;q=75 2x')
        })
      `,
    },
    dependencies: {
      jest: '29.7.0',
    },
  })

  it('should use the custom loader file when rendering next/image', async () => {
    const { stdout, stderr, exitCode } = await execa(
      'pnpm',
      ['jest', 'tests/avatar.test.js'],
      {
        cwd: next.testDir,
        reject: false,
      }
    )
    const output = stdout + stderr
    // Without mapping the default image loader to the loaderFile, next/image
    // falls back to the default /_next/image loader and the assertion in
    // tests/avatar.test.js fails.
    expect(output).toContain('1 passed')
    expect(exitCode).toBe(0)
  })
})
