import { createNext } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'

describe('next/jest newLinkBehavior', () => {
  let next: NextInstance

  if (process.env.NEXT_TEST_REACT_VERSION === '^17') {
    // react testing library is specific to react version
    it('should bail on react v17', () => {})
    return
  }

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
            act(() => {
              render(<Page />)

              const link = screen.getByRole('link', { name: 'Hello World!' })
              expect(link.getAttribute('href')).toBe('https://example.com')
            })
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
        jest: '27.4.7',
        '@testing-library/react': '12.1.2',
      },
      packageJson: {
        scripts: {
          build: 'next build && yarn jest --forceExit test/index.test.jsx',
        },
      },
      skipStart: true,
      buildCommand: `yarn build`,
    })
  })

  afterAll(() => next.destroy())

  it(`should use new link behavior`, async () => {
    await next.start()
  })
})
