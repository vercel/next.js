import { createNext } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { renderViaHTTP } from 'next-test-utils'
describe('next/jest', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: {
        'pages/index.js': `import capitalize from '@hashicorp/platform-util/text/capitalize'
        export default function Home() {
          return capitalize('test')
        }`,
        'index.test.ts': `import capitalize from '@hashicorp/platform-util/text/capitalize'
        it('should work', () => {
          expect(capitalize('test')).toEqual('Test')
        })`,
        'jest.config.js': `module.exports = require('next/jest')({ dir: './' })()`,
        'next.config.js': `module.exports = {
          transpilePackages: ['@hashicorp/platform-util'],
        }`,
      },
      packageJson: {
        scripts: {
          // Runs jest and bails if jest fails
          build: 'next build && jest',
        },
      },
      installCommand: 'pnpm i',
      buildCommand: `pnpm build`,
      dependencies: {
        '@hashicorp/platform-util': '0.2.0',
        '@types/react': 'latest',
        jest: '27.4.7',
      },
    })
  })
  afterAll(() => next.destroy())

  it('should work', async () => {
    const html = await renderViaHTTP(next.url, '/')
    expect(html).toContain('Test')
  })
})
