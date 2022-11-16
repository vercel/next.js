import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { renderViaHTTP } from 'next-test-utils'
import { join } from 'path'
describe('next/jest', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: {
        pages: new FileRef(join(__dirname, 'app/pages')),
        'index.test.ts': new FileRef(join(__dirname, 'app/index.test.ts')),
        'jest.config.js': new FileRef(join(__dirname, 'app/jest.config.js')),
        'next.config.js': new FileRef(join(__dirname, 'app/next.config.js')),
      },
      packageJson: {
        scripts: {
          // Runs jest and bails if jest fails
          build: 'next build && yarn jest',
        },
      },
      buildCommand: `yarn build`,
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
