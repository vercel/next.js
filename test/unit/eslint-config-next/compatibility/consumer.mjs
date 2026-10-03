import assert from 'node:assert/strict'
import { cpSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Manual packed-package check: run this script with an independently installed
// consumer directory as its argument. Unlike the workspace tests, that directory
// must install the config tarball with strict peers and no overrides, package
// extensions, --force, or --legacy-peer-deps. This exercises shipped bundles and
// normal next/babel resolution rather than the repository's hoisted dependencies.
const directory = resolve(process.argv[2])
const require = createRequire(join(directory, 'package.json'))
const { Linter } = require('eslint')
const fixtures = join(directory, 'fixtures')
cpSync(join(dirname(fileURLToPath(import.meta.url)), 'fixtures'), fixtures, {
  recursive: true,
})

const config = require('eslint-config-next')
const coreWebVitals = require('eslint-config-next/core-web-vitals')
const typescript = require('eslint-config-next/typescript')
const cases = [
  [
    config,
    'component.jsx',
    ['react/jsx-no-undef', 'jsx-a11y/alt-text', '@next/next/no-img-element'],
  ],
  [
    coreWebVitals,
    'component.jsx',
    ['react/jsx-no-undef', 'jsx-a11y/alt-text', '@next/next/no-img-element'],
  ],
  [
    config,
    'component.tsx',
    ['react/jsx-no-undef', 'jsx-a11y/alt-text', '@next/next/no-img-element'],
  ],
  [
    coreWebVitals,
    'component.tsx',
    ['react/jsx-no-undef', 'jsx-a11y/alt-text', '@next/next/no-img-element'],
  ],
  [
    typescript,
    'typescript.ts',
    ['@typescript-eslint/no-explicit-any', '@typescript-eslint/no-unused-vars'],
  ],
  [config, 'anonymous.jsx', ['react/display-name']],
  [
    config,
    'hooks.jsx',
    ['react-hooks/rules-of-hooks', 'react-hooks/exhaustive-deps'],
  ],
  [
    config,
    'accessibility.jsx',
    [
      'jsx-a11y/alt-text',
      'jsx-a11y/aria-props',
      'jsx-a11y/aria-proptypes',
      'jsx-a11y/aria-unsupported-elements',
      'jsx-a11y/role-has-required-aria-props',
      'jsx-a11y/role-supports-aria-props',
    ],
  ],
  [config, 'import.js', ['import/no-anonymous-default-export']],
]

for (const [activeConfig, name, expectedRules] of cases) {
  const filename = join(fixtures, name)
  const diagnostics = new Linter({ cwd: directory }).verify(
    readFileSync(filename, 'utf8'),
    activeConfig,
    { filename }
  )
  assert(!diagnostics.some(({ fatal }) => fatal), JSON.stringify(diagnostics))
  for (const ruleId of expectedRules) {
    assert(
      diagnostics.some((diagnostic) => diagnostic.ruleId === ruleId),
      `${name}: missing ${ruleId}`
    )
  }
}

// Consumers can keep the existing import/* rule names while import-x supplies
// the implementation. Verify actual TS path resolution, not just rule loading.
const filename = join(fixtures, 'imports.ts')
const diagnostics = new Linter({ cwd: directory }).verify(
  readFileSync(filename, 'utf8'),
  [
    ...config,
    {
      settings: {
        'import-x/resolver': {
          typescript: { project: join(fixtures, 'tsconfig.json') },
        },
      },
      rules: { 'import/no-unresolved': 'error' },
    },
  ],
  { filename }
)
assert(!diagnostics.some(({ fatal }) => fatal), JSON.stringify(diagnostics))
const unresolved = diagnostics.filter(
  ({ ruleId }) => ruleId === 'import/no-unresolved'
)
assert.equal(unresolved.length, 1, JSON.stringify(diagnostics))
assert.match(unresolved[0].message, /\.\/missing/)

console.log(
  JSON.stringify({
    node: process.version,
    eslint: Linter.version,
    cases: cases.length + 1,
  })
)
