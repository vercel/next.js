import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
// Resolve the test-only ESLint 10 alias and plugin internals from the config
// package itself. The root ESLint dependency remains the ESLint 9 baseline.
const requireFromConfig = createRequire(require.resolve('eslint-config-next'))
const directory = dirname(fileURLToPath(import.meta.url))
const fixtures = join(directory, 'fixtures')
const { Linter: Linter9 } = require('eslint')
const { Linter: Linter10 } = requireFromConfig('eslint-10')
const parser = require('eslint-config-next/parser')
// Compare the shipped adapter with Next's actual bundled parser, not a mocked
// scope manager or a separately installed Babel release.
const rawParser = require('next/dist/compiled/babel/eslint-parser')
const { fixupBabelScope } = requireFromConfig('./babel-scope.js')
const configPackage = requireFromConfig('../package.json')
const nextPackage = require('next/package.json')
// Build-time bundles must not leak the upstream incompatible peer declarations
// back into the published dependency graph. The clean-consumer script verifies
// installation and execution; this assertion catches manifest regressions in CI.
for (const name of ['eslint-plugin-react', 'eslint-plugin-jsx-a11y']) {
  assert(!Object.hasOwn(configPackage.dependencies, name))
}
assert.equal(
  configPackage.dependencies['eslint-plugin-import'],
  'npm:eslint-plugin-import-x@^4.17.1'
)
// Isolate lint-parser behavior from application Babel configuration and build
// transforms. JSX/Flow parsing is selected explicitly, while the configurations'
// rule sets, parser selection, and React-version detection remain enabled.
const babelOptions = {
  configFile: false,
  babelrc: false,
  presets: [],
  parserOpts: { plugins: ['jsx'] },
}

const parserCases = [
  {
    name: 'configured-globals',
    globals: { known: 'readonly' },
    expectedRules: ['no-undef'],
  },
  { name: 'inline-globals', expectedRules: ['no-undef'] },
  {
    name: 'readonly-globals',
    globals: { known: 'readonly' },
    expectedRules: ['no-global-assign'],
  },
  {
    name: 'writable-globals',
    globals: { known: 'writable' },
    expectedRules: [],
  },
  {
    name: 'disabled-globals',
    globals: { known: 'off' },
    expectedRules: ['no-undef'],
  },
  {
    name: 'inline-overrides-config',
    globals: { known: 'readonly' },
    expectedRules: [],
  },
  {
    name: 'shadowed-globals',
    globals: { known: 'readonly' },
    expectedRules: [],
  },
  {
    name: 'unused-locals',
    globals: { known: 'readonly' },
    expectedRules: ['no-unused-vars'],
  },
  {
    name: 'script-declaration',
    sourceType: 'script',
    expectedRules: ['no-implicit-globals'],
  },
  {
    name: 'script-implicit-globals',
    globals: { known: 'writable' },
    sourceType: 'script',
    expectedRules: ['no-undef'],
  },
  { name: 'jsx', globals: { known: 'readonly' }, expectedRules: ['no-undef'] },
  {
    name: 'flow',
    globals: { known: 'readonly' },
    plugins: ['flow', 'jsx'],
    expectedRules: [],
  },
]

function verifyParser(Linter, activeParser, fixture) {
  const filename = join(fixtures, `${fixture.name}.jsx`)
  return new Linter({ cwd: directory })
    .verify(
      readFileSync(filename, 'utf8'),
      [
        {
          files: ['**/*.jsx'],
          languageOptions: {
            parser: activeParser,
            sourceType: fixture.sourceType || 'module',
            globals: fixture.globals || {},
            parserOptions: {
              requireConfigFile: false,
              babelOptions: {
                ...babelOptions,
                parserOpts: { plugins: fixture.plugins || ['jsx'] },
              },
            },
          },
          rules: {
            'no-undef': 'error',
            'no-unused-vars': 'error',
            'no-global-assign': 'error',
            'no-implicit-globals': 'error',
          },
        },
      ],
      { filename }
    )
    .map(({ ruleId, message, fatal, line, column }) => ({
      ruleId,
      message,
      fatal: !!fatal,
      line,
      column,
    }))
}

const results = {
  engines: [Linter9.version, Linter10.version],
  // These are deliberate upgrade-review tripwires, not supported version ranges.
  // Next's manifest records the build inputs for the bundled Babel parser; the
  // React check also verifies which plugin consumers actually load here.
  dependencyVersions: {
    react: configPackage.devDependencies['eslint-plugin-react'],
    installedReact: requireFromConfig('eslint-plugin-react/package.json')
      .version,
    jsxA11y: configPackage.devDependencies['eslint-plugin-jsx-a11y'],
    installedJsxA11y: requireFromConfig('eslint-plugin-jsx-a11y/package.json')
      .version,
    babelParser: nextPackage.devDependencies['@babel/eslint-parser'],
    babelCore: nextPackage.devDependencies['@babel/core'],
  },
  parserCases: parserCases.map((fixture) => {
    const baseline = verifyParser(Linter9, rawParser, fixture)
    // Verify that the baseline parses and exercises the intended checks before
    // comparing engines, so identical empty or failed results cannot pass.
    assert(!baseline.some((message) => message.fatal))
    for (const ruleId of fixture.expectedRules) {
      assert(baseline.some((message) => message.ruleId === ruleId))
    }
    return {
      name: fixture.name,
      baseline,
      eslint9: verifyParser(Linter9, parser, fixture),
      eslint10: verifyParser(Linter10, parser, fixture),
    }
  }),
  configCases: [],
  scopeManagerErrors: [],
}

const configs = [
  {
    name: 'default JavaScript',
    config: require('eslint-config-next'),
    filename: 'component.jsx',
    expectedRules: [
      'react/jsx-no-undef',
      'jsx-a11y/alt-text',
      '@next/next/no-img-element',
    ],
  },
  {
    name: 'core-web-vitals JavaScript',
    config: require('eslint-config-next/core-web-vitals'),
    filename: 'component.jsx',
    expectedRules: [
      'react/jsx-no-undef',
      'jsx-a11y/alt-text',
      '@next/next/no-img-element',
    ],
  },
  {
    name: 'default TypeScript',
    config: require('eslint-config-next'),
    filename: 'component.tsx',
    expectedRules: [
      'react/jsx-no-undef',
      'jsx-a11y/alt-text',
      '@next/next/no-img-element',
    ],
  },
  {
    name: 'core-web-vitals TypeScript',
    config: require('eslint-config-next/core-web-vitals'),
    filename: 'component.tsx',
    expectedRules: [
      'react/jsx-no-undef',
      'jsx-a11y/alt-text',
      '@next/next/no-img-element',
    ],
  },
  {
    name: 'typescript',
    config: require('eslint-config-next/typescript'),
    filename: 'typescript.ts',
    expectedRules: [
      '@typescript-eslint/no-explicit-any',
      '@typescript-eslint/no-unused-vars',
    ],
  },
  {
    name: 'React display-name',
    config: require('eslint-config-next'),
    filename: 'anonymous.jsx',
    expectedRules: ['react/display-name'],
  },
  {
    name: 'React Hooks',
    config: require('eslint-config-next'),
    filename: 'hooks.jsx',
    expectedRules: [
      'react-hooks/rules-of-hooks',
      'react-hooks/exhaustive-deps',
    ],
  },
  {
    name: 'accessibility rules',
    config: require('eslint-config-next'),
    filename: 'accessibility.jsx',
    expectedRules: [
      'jsx-a11y/alt-text',
      'jsx-a11y/aria-props',
      'jsx-a11y/aria-proptypes',
      'jsx-a11y/aria-unsupported-elements',
      'jsx-a11y/role-has-required-aria-props',
      'jsx-a11y/role-supports-aria-props',
    ],
  },
  {
    name: 'anonymous import export',
    config: require('eslint-config-next'),
    filename: 'import.js',
    expectedRules: ['import/no-anonymous-default-export'],
  },
  {
    name: 'TypeScript import resolution',
    config: require('eslint-config-next'),
    filename: 'imports.ts',
    expectedRules: ['import/no-unresolved'],
    extraConfig: [
      {
        settings: {
          'import-x/resolver': {
            typescript: { project: join(fixtures, 'tsconfig.json') },
          },
        },
        // This rule is a consumer extension, not a new Next default. Verify
        // import-x actually uses the configured TypeScript resolver and reports
        // only the deliberately missing module, not the valid tsconfig alias.
        rules: { 'import/no-unresolved': 'error' },
      },
    ],
  },
]

// React's bundled version detector has a process-global cache. Run ESLint 10
// first, while that bundle is cold: an ESLint 9 detection must not hide a
// removed getFilename() call. The unbundled build-time package has a separate
// cache, so resetting that dependency would not reset the consumer-facing code.
for (const Linter of [Linter10, Linter9]) {
  for (const fixture of configs) {
    const filename = join(fixtures, fixture.filename)
    const diagnostics = new Linter({ cwd: directory }).verify(
      readFileSync(filename, 'utf8'),
      [
        ...fixture.config,
        {
          files: ['**/*.{js,jsx}'],
          languageOptions: { parserOptions: { babelOptions } },
        },
        ...(fixture.extraConfig || []),
      ],
      { filename }
    )
    if (fixture.name === 'TypeScript import resolution') {
      const unresolved = diagnostics.filter(
        ({ ruleId }) => ruleId === 'import/no-unresolved'
      )
      assert.equal(unresolved.length, 1)
      assert.match(unresolved[0].message, /\.\/missing/)
    }
    results.configCases.push({
      name: fixture.name,
      engine: Linter.version,
      expectedRules: fixture.expectedRules,
      diagnostics: diagnostics.map(({ ruleId, message, fatal }) => ({
        ruleId,
        message,
        fatal: !!fatal,
      })),
    })
  }
}

// Start with the actual pinned parser's scopes, then remove or change one part
// of the private contract. A different implementation must fail explicitly,
// including one with native addGlobals(); it requires reviewing/removing this
// patch, not silently passing through or skipping reference maintenance.
const unsupportedScopes = [
  {
    name: 'native addGlobals',
    change(scopeManager) {
      scopeManager.addGlobals = () => {}
    },
  },
  {
    name: 'missing __defineGeneric',
    change(scopeManager) {
      scopeManager.globalScope.__defineGeneric = undefined
    },
  },
  {
    name: 'missing implicit globals',
    change(scopeManager) {
      delete scopeManager.globalScope.implicit
    },
  },
  {
    name: 'missing implicit.left',
    change(scopeManager) {
      delete scopeManager.globalScope.implicit.left
    },
  },
]

for (const fixture of unsupportedScopes) {
  const { scopeManager } = rawParser.parseForESLint('known', {
    requireConfigFile: false,
    sourceType: 'module',
    babelOptions,
  })
  fixture.change(scopeManager)
  let message = null
  try {
    fixupBabelScope(scopeManager)
  } catch (error) {
    message = error.message
  }
  results.scopeManagerErrors.push({ name: fixture.name, message })
}

console.log(JSON.stringify(results))
