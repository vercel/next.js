import { FileRef, nextTestSetup } from 'e2e-utils'
import execa from 'execa'
import path from 'path'

const appDir = path.join(__dirname, 'app')

describe('next/jest', () => {
  const { next, isNextDeploy } = nextTestSetup({
    files: {
      components: new FileRef(path.join(appDir, 'components')),
      pages: new FileRef(path.join(appDir, 'pages')),
      'tests/entry.test.tsx': `
      import { act, render, waitFor } from '@testing-library/react'
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
      
          act(() => {
            environment.mock.resolveMostRecentOperation((operation) => {
              return MockPayloadGenerator.generate(operation)
            })
          })
      
          await waitFor(() => getByText('Data requested:'))
      
          expect(getByText('Data requested:')).not.toBe(null)
        })
      })
      
      `,
      types: new FileRef(path.join(appDir, 'types')),
      'jest.config.js': new FileRef(path.join(appDir, 'jest.config.js')),
      'main.graphql': new FileRef(path.join(appDir, 'main.graphql')),
      'next.config.js': new FileRef(path.join(appDir, 'next.config.js')),
      'relay.config.json': new FileRef(path.join(appDir, 'relay.config.json')),
      'tsconfig.json': new FileRef(path.join(appDir, 'tsconfig.json')),
    },
    dependencies: {
      jest: '29.7.0',
      '@testing-library/react': '15.0.2',
      '@types/jest': '27.4.1',
      '@types/relay-runtime': '20.1.1',
      'babel-jest': '27.5.1',
      'babel-plugin-relay': '21.0.1',
      'jest-environment-jsdom': '29.7.0',
      'react-relay': '21.0.1',
      'relay-compiler': '21.0.1',
      'relay-runtime': '21.0.1',
      'relay-test-utils': '21.0.1',
      typescript: '5.9.3',
    },
    packageJson: {
      scripts: {
        // Runs jest and bails if jest fails
        build: 'jest --forceExit tests/entry.test.tsx && next build',
      },
    },
  })

  ;(isNextDeploy ? it.skip : it)('has up-to-date graphql types', async () => {
    await execa('pnpm', ['exec', 'relay-compiler', '--validate'], {
      cwd: next.testDir,
      stdout: 'inherit',
      stderr: 'inherit',
    })
  })

  it('should work', async () => {
    // Suite fails if `jest` fails during `build`
    expect(typeof '').toBe('string')
  })
})
