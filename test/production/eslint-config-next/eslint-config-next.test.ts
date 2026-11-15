import { spawnSync } from 'child_process'
import { join, relative } from 'path'
import { FileRef, nextTestSetup } from 'e2e-utils'

const files = new FileRef(join(__dirname, 'fixture'))

const javascriptDiagnostics = [
  'app/page.jsx:2 @next/next/no-img-element',
  'app/page.jsx:2 jsx-a11y/alt-text',
  'components/widget.jsx:10 import/no-anonymous-default-export',
  'components/widget.jsx:10 react/display-name',
  'components/widget.jsx:5 react-hooks/rules-of-hooks',
  'components/widget.jsx:7 react/jsx-no-undef',
  'lib/globals.js:2 no-unused-vars',
  'lib/globals.js:3 no-global-assign',
  'lib/globals.js:3 no-implicit-globals',
  // Only `missing`. `injected` and `configured` are declared globals.
  'lib/globals.js:3 no-undef',
  'lib/globals.js:4 import/no-default-export',
  // Only `disabled`, which is turned off in the config.
  'lib/overrides.js:2 no-undef',
  'lib/script.js:1 no-implicit-globals',
  'lib/script.js:3 no-implicit-globals',
  'lib/script.js:3 no-undef',
]

const typescriptDiagnostics = [
  'globals.js:2 import/no-anonymous-default-export',
  // Only `missing`. `injected` is a declared global.
  'globals.js:2 no-undef',
  // Only `./missing`. `@/page` resolves through the tsconfig paths.
  'imports.ts:2 import/no-unresolved',
  'page.tsx:1 @typescript-eslint/no-explicit-any',
  'page.tsx:2 @typescript-eslint/no-unused-vars',
  'page.tsx:5 @next/next/no-img-element',
  'page.tsx:5 jsx-a11y/alt-text',
]

function lint(testDir: string, directory: string) {
  const cwd = join(testDir, directory)
  const { stdout, stderr } = spawnSync(
    process.execPath,
    [
      join(testDir, 'node_modules/eslint/bin/eslint.js'),
      '--format',
      'json',
      '.',
    ],
    { cwd, encoding: 'utf8' }
  )

  let results: {
    filePath: string
    messages: { ruleId: string | null; line: number; message: string }[]
  }[]
  try {
    results = JSON.parse(stdout)
  } catch {
    throw new Error(`ESLint failed:\n${stderr}`)
  }

  return results
    .flatMap(({ filePath, messages }) =>
      messages.map(
        ({ ruleId, line, message }) =>
          `${relative(cwd, filePath).replace(/\\/g, '/')}:${line} ${ruleId ?? message}`
      )
    )
    .sort()
}

describe.each(['9.37.0', '10.11.0'])(
  'eslint-config-next with ESLint %s',
  (eslint) => {
    const { next } = nextTestSetup({
      files,
      skipStart: true,
      dependencies: {
        eslint,
        'eslint-config-next': 'workspace:*',
        'eslint-plugin-react': '7.37.5',
      },
    })

    it('should lint a JavaScript project', () => {
      expect(lint(next.testDir, '.')).toEqual(javascriptDiagnostics)
    })

    it('should lint a TypeScript project', () => {
      expect(lint(next.testDir, 'typescript')).toEqual(typescriptDiagnostics)
    })
  }
)

// npm doesn't hoist the plugins whose ESLint peer range excludes ESLint 10,
// so they and the import resolvers are nested under eslint-config-next.
describe('eslint-config-next with ESLint 10 installed by npm', () => {
  const { next } = nextTestSetup({
    files,
    skipStart: true,
    dependencies: {
      eslint: '10.11.0',
      'eslint-config-next': 'workspace:*',
    },
    installCommand: 'npm install --no-audit --no-fund',
  })

  it('should lint a TypeScript project', () => {
    expect(lint(next.testDir, 'typescript')).toEqual(typescriptDiagnostics)
  })
})
