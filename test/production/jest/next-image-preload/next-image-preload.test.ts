import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { renderViaHTTP } from 'next-test-utils'
import path from 'path'

const appDir = path.join(__dirname, 'app')

describe('next/jest', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: {
        skipStart: true,
        app: new FileRef(path.join(appDir, 'app')),
        [`${appDir}/app/index.test.tsx`]: `
        import { render, screen } from '@testing-library/react'
        import Page from './page'

        it('<Page /> renders', () => {
          render(<Page />)

          const logo = screen.getByRole('img')

          expect(logo).toBeVisible()
        })
        `,
        'jest.config.js': new FileRef(path.join(appDir, 'jest.config.js')),
      },
      dependencies: {
        jest: '27.4.7',
        '@testing-library/react': '13.1.1',
        jsdom: '19.0.0',
        '@testing-library/jest-dom': '5.16.4',
      },
      packageJson: {
        scripts: {
          // Runs jest and bails if jest fails
          build:
            'pnpm jest --forceExit tests/index.test.tsx && pnpm next build',
        },
      },
    })
  })
  afterAll(() => next.destroy())

  it('Should not throw preload is undefined error', async () => {
    expect(next.cliOutput).not.toContain(
      '"Error: Uncaught [TypeError: (0 , _reactdom.preload) is not a function]'
    )
  })
})
