import { createNext } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { renderViaHTTP } from 'next-test-utils'

describe('next/jest', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: {
        'pages/index.js': `
          export default function Page() { 
            return <p>hello world</p>
          } 
        `,
        'jest.config.js': `
          // jest.config.js
          const nextJest = require('next/jest')
          
          const createJestConfig = nextJest({
            // Provide the path to your Next.js app to load next.config.js and .env files in your test environment
            dir: './',
          })
          
          // Add any custom config to be passed to Jest
          const customJestConfig = {
            // if using TypeScript with a baseUrl set to the root directory then you need the below for alias' to work
            moduleDirectories: ['node_modules', '<rootDir>/'],
            testEnvironment: 'jest-environment-jsdom',
          }
          
          // createJestConfig is exported this way to ensure that next/jest can load the Next.js config which is async
          module.exports = createJestConfig(customJestConfig)
        `,
        'test/mock.test.js': `
          import router from 'next/router'

          jest.mock('next/router', () => ({
            push: jest.fn(),
            back: jest.fn(),
            events: {
              on: jest.fn(),
              off: jest.fn(),
            },
            asPath: jest.fn().mockReturnThis(),
            beforePopState: jest.fn(() => null),
            useRouter: () => ({
              push: jest.fn(),
            }),
          }))

          it('call mocked', async () => {
            expect(router.push._isMockFunction).toBeTruthy()
          })
        `,
      },
      dependencies: {
        jest: '27.4.7',
      },
      packageJson: {
        scripts: {
          build: 'next build && yarn jest test/mock.test.js',
        },
      },
      buildCommand: `yarn build`,
    })
  })
  afterAll(() => next.destroy())

  it('should work', async () => {
    const html = await renderViaHTTP(next.url, '/')
    expect(html).toContain('hello world')
  })
})
