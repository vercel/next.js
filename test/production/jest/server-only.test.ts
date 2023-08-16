import { createNext } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'

describe('next/jest', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      skipStart: true,
      files: {
        'app/layout.jsx': `export default function RootLayout({ children }) {
          return (
            <html lang="en">
              <body>{children}</body>
            </html>
          )
        }`,

        'app/page.jsx': `import { PI } from '../lib/util'
        export default function Home() {
          return <h1>{PI}</h1>
        }`,

        'app/page.test.jsx': `import { render, screen } from '@testing-library/react'
        import '@testing-library/jest-dom'
        import Page from './page'
        
        it('works from client-side code', () => {
          render(<Page />)
          expect(screen.getByRole('heading')).toHaveTextContent('3.14')
        })`,

        'app/[blog]/page.jsx': `import { Metadata } from 'next'
        
        export async function generateMetadata({
          params: { blog: title },
        }) {
          return { title, description: 'A blog post about ' + title }
        }
        
        export default function Page({ params }) {
          return <h1>All about {params.blog}</h1>
        }
        `,

        'app/[blog]/page.test.jsx': `import { render, screen } from '@testing-library/react'
        import '@testing-library/jest-dom'
        import Page from './page'
        
        describe('Blog Page', () => {
          it('has the appropriate title', () => {
            render(<Page params={{ blog: 'Jane' }} />)
            expect(screen.getByRole('heading')).toHaveTextContent('All about Jane')
          })
        })
        `,

        'lib/util.js': `
        import 'server-only'
        export const PI = 3.14;`,

        'lib/utils.test.ts': `
        import { PI } from './util'
        it('works from server-side code', () => {
          expect(PI).toEqual(3.14)
        })`,

        'jest.config.js': `module.exports = require('next/jest')({ dir: './' })({ testEnvironment: 'jsdom' })`,
      },
      buildCommand: `yarn jest`,
      dependencies: {
        '@types/react': 'latest',
        '@testing-library/jest-dom': '5.16.5',
        '@testing-library/react': '13.0.0',
        jest: '27.4.7',
      },
    })
  })

  afterAll(() => next.destroy())

  it('can run test against server server only code', async () => {
    try {
      await next.start()
    } finally {
      expect(next.cliOutput).toInclude('Tests:       3 passed, 3 total')
    }
  })
})
