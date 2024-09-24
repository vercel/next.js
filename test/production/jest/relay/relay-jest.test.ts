import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'e2e-utils'
import path from 'path'

const appDir = path.join(__dirname, 'app')

// react-relay is not compatible with React 19 and therefore Next.js 15
describe.skip('next/jest', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: {
        components: new FileRef(path.join(appDir, 'components')),
        pages: new FileRef(path.join(appDir, 'pages')),
        'tests/entry.test.tsx': `
        import { render, waitFor } from '@testing-library/react'
        import { RelayEnvironmentProvider } from 'react-relay'
        import { createMockEnvironment, MockPayloadGenerator } from 'relay-test-utils'
        
        import Page from '@/pages'
        
        describe('test graphql tag transformation', () => {
          it('should work', async () => {
            let environment = createMockEnvironment()
        
            const { getByText } = render(
              <RelayEnvironmentProvider environment={environment}>
                <Page />
              </RelayEnvironmentProvider>
            )
        
            environment.mock.resolveMostRecentOperation((operation) => {
              return MockPayloadGenerator.generate(operation)
            })
        
            await waitFor(() => getByText('Data requested:'))
        
            expect(getByText('Data requested:')).not.toBe(null)
          })
        })
        
        `,
        types: new FileRef(path.join(appDir, 'types')),
        'jest.config.js': new FileRef(path.join(appDir, 'jest.config.js')),
        'next.config.js': new FileRef(path.join(appDir, 'next.config.js')),
        'tsconfig.json': new FileRef(path.join(appDir, 'tsconfig.json')),
        'main.graphql': new FileRef(path.join(appDir, 'main.graphql')),
      },
      dependencies: {
        jest: '27.4.7',
        'react-relay': '13.2.0',
        '@testing-library/react': '15.0.2',
        '@types/jest': '27.4.1',
        'babel-jest': '27.5.1',
        'babel-plugin-relay': '13.2.0',
        jsdom: '19.0.0',
        'relay-compiler': '13.0.1',
        'relay-runtime': '13.0.2',
        'relay-test-utils': '13.0.2',
        typescript: '5.2.2',
      },
      packageJson: {
        scripts: {
          // Runs jest and bails if jest fails
          build: 'jest --forceExit tests/entry.test.tsx && next build',
        },
      },
      installCommand: 'pnpm i',
      buildCommand: `pnpm build`,
    })
  })
  afterAll(() => next.destroy())

  it('should work', async () => {
    // Suite fails if `jest` fails during `build`
    expect(typeof '').toBe('string')
  })
})
