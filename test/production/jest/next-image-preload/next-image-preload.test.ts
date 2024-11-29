import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'e2e-utils'
import path from 'path'
import execa from 'execa'

const appDir = path.join(__dirname, 'app')

describe('next/jest', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      skipStart: true,
      files: {
        app: new FileRef(path.join(appDir, 'app')),
        [`tests/index.test.tsx`]: `
        import { render, screen } from '@testing-library/react'
        import Page from '../app/page'

        it('<Page /> renders', () => {
          render(<Page />)
          const logo = screen.getByRole('img')
          expect(logo).toBeDefined()
        })
        `,
        'jest.config.js': new FileRef(path.join(appDir, 'jest.config.js')),
      },
      dependencies: {
        jest: '29.7.0',
        'jest-environment-jsdom': '29.7.0',
        '@testing-library/react': '15.0.2',
        '@testing-library/jest-dom': '5.17.0',
        // TODO: nwsapi is a transitive dependency of jest-environment-jsdom >
        // jsdom. We're temporarily pinning the version here because later
        // versions cause `ReferenceError: document is not defined`
        nwsapi: '2.2.13',
      },
    })
  })
  afterAll(() => next.destroy())

  it('Should not throw preload is undefined error', async () => {
    const { stdout, stderr } = await execa(
      'pnpm',
      ['jest', 'tests/index.test.tsx'],
      {
        cwd: next.testDir,
        reject: false,
      }
    )
    // Uncaught [TypeError: (0 , _reactdom.preload) is not a function]
    expect(stdout + stderr).not.toContain('is not a function')
  })
})
