import { createNext } from 'e2e-utils'
import { NextInstance } from 'e2e-utils'
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
        import lodashEs from 'lodash-es/camelCase'
        it('should work with next.config transpilePackages', () => {
          expect(capitalize('test')).toEqual('Test')
        })
        it('should work with additionalTranspilePackages in Jest only', () => {
          expect(lodashEs('hello-world')).toEqual('helloWorld')
        })`,
        'jest.config.js': `const nextJest = require('next/jest')
        const createJestConfig = nextJest({ 
          dir: './',
          additionalTranspilePackages: ['lodash-es']
        })
        module.exports = createJestConfig()`,
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
        'lodash-es': '4.17.21',
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
