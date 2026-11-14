import { nextTestSetup } from 'e2e-utils'
import { renderViaHTTP } from 'next-test-utils'

describe('next/jest with ESM import attributes', () => {
  const { next } = nextTestSetup({
    files: {
      'app/layout.js': `export default function RootLayout({ children }) {
        return <html><body>{children}</body></html>
      }`,
      'app/page.js': `import data from '../data.json' with { type: 'json' }
      export default function Page() {
        return <p>{data.message}</p>
      }`,
      'data.json': `{ "message": "hello from json" }`,
      'index.test.js': `import data from './data.json' with { type: 'json' }
      it('should load a JSON module with an import attribute', () => {
        expect(data.message).toBe('hello from json')
      })`,
      'jest.config.js': `import nextJest from 'next/jest.js'
      export default nextJest({ dir: './' })({ testEnvironment: 'node' })`,
    },
    packageJson: {
      type: 'module',
      scripts: {
        // Runs jest in ESM mode and bails if jest fails
        build:
          'next build && node --experimental-vm-modules node_modules/jest/bin/jest.js',
      },
    },
    installCommand: 'pnpm i',
    buildCommand: `pnpm build`,
    dependencies: {
      jest: '30.5.2',
    },
  })

  it('should work', async () => {
    const html = await renderViaHTTP(next.url, '/')
    expect(html).toContain('hello from json')
  })
})
