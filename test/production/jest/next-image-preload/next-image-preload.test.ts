import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
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
          expect(logo).toBeVisible()
        })
        `,
        'jest.config.js': new FileRef(path.join(appDir, 'jest.config.js')),
      },
      packageJson: {
        dependencies: {
          jest: '29.6.2',
          'jest-environment-jsdom': '29.6.2',
          '@testing-library/react': '14.0.0',
          '@testing-library/jest-dom': '5.17.0',
        },
        scripts: {
          build: 'pnpm jest --forceExit tests/index.test.tsx',
        },
      },
    })
  })
  afterAll(() => next.destroy())

  it('Should not throw preload is undefined error', async () => {
    const { stdout } = await execa('pnpm', ['jest', 'tests/index.test.tsx'], {
      cwd: next.testDir,
      env: { ...process.env },
    })
    //const { cliOutput } = await next.build()
    //await next.start()
    await require('timers/promises').setTimeout(1000)
    expect(stdout).toContain('blarg')
  })
})
