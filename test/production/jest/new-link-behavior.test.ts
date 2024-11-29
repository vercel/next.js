import { createNext } from 'e2e-utils'
import { NextInstance } from 'e2e-utils'

describe('next/jest newLinkBehavior', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: {
        'pages/index.jsx': `
          import Link from 'next/link'

          export default function Page() {
            return <Link href='https://example.com'><div>Hello World!</div></Link>
          }
        `,
        'test/index.test.jsx': `
          import { render, screen, act } from '@testing-library/react'
          import Page from '../pages/index'

          it('Link', () => {
            render(<Page />)

            const link = screen.getByRole('link', { name: 'Hello World!' })
            expect(link.getAttribute('href')).toBe('https://example.com')
          })
        `,
        'jest.config.js': `
          const nextJest = require('next/jest')
          const createJestConfig = nextJest({ dir: './' })
          module.exports = createJestConfig({
            testEnvironment: 'jest-environment-jsdom',
          })
        `,
      },
      dependencies: {
        jest: '29.7.0',
        'jest-environment-jsdom': '29.7.0',
        '@testing-library/react': '15.0.2',
        // TODO: nwsapi is a transitive dependency of jest-environment-jsdom >
        // jsdom. We're temporarily pinning the version here because later
        // versions cause `ReferenceError: document is not defined`
        nwsapi: '2.2.13',
      },
      packageJson: {
        scripts: {
          build: 'next build && jest --forceExit test/index.test.jsx',
        },
      },
      installCommand: 'pnpm i',
      skipStart: true,
      buildCommand: `pnpm build`,
    })
  })

  afterAll(() => next.destroy())

  it(`should use new link behavior`, async () => {
    await next.start()
  })
})
