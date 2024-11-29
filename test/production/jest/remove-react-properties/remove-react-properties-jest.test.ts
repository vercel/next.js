import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'e2e-utils'
import { renderViaHTTP } from 'next-test-utils'
import path from 'path'

const appDir = path.join(__dirname, 'app')

describe('next/jest', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: {
        pages: new FileRef(path.join(appDir, 'pages')),
        'tests/index.test.tsx': `
        import { render, waitFor } from '@testing-library/react'
        import '@testing-library/jest-dom/extend-expect';

        import Page from '@/pages'

        describe('testid', () => {
          it('data-testid should be available in the test', async () => {
            const { getByTestId } = render(
              <Page />
            )
            expect(getByTestId('main-text')).toHaveTextContent('Hello World')
          })
        })
        
        `,
        'jest.config.js': new FileRef(path.join(appDir, 'jest.config.js')),
        'next.config.js': new FileRef(path.join(appDir, 'next.config.js')),
        'tsconfig.json': new FileRef(path.join(appDir, 'tsconfig.json')),
      },
      dependencies: {
        jest: '29.7.0',
        'jest-environment-jsdom': '29.7.0',
        '@testing-library/react': '15.0.2',
        '@testing-library/jest-dom': '5.16.4',
        // TODO: nwsapi is a transitive dependency of jest-environment-jsdom >
        // jsdom. We're temporarily pinning the version here because later
        // versions cause `ReferenceError: document is not defined`
        nwsapi: '2.2.13',
      },
      packageJson: {
        scripts: {
          // Runs jest and bails if jest fails
          build: 'jest --forceExit tests/index.test.tsx && next build',
        },
      },
      installCommand: 'pnpm i',
      buildCommand: `pnpm build`,
    })
  })
  afterAll(() => next.destroy())

  it('data-testid should be removed in production', async () => {
    const html = await renderViaHTTP(next.url, '/')

    expect(html).not.toContain('data-testid')
  })
})
