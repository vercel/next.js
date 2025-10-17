import { defineConfig } from 'eslint/config'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import jest from 'eslint-plugin-jest'
import _import from 'eslint-plugin-import'
import jsdoc from 'eslint-plugin-jsdoc'
import { fixupPluginRules } from '@eslint/compat'
import globals from 'globals'
import babelParser from '@babel/eslint-parser'
import tseslint from 'typescript-eslint'
import nextEslintPluginInternal from '@next/eslint-plugin-internal'
import mdxParser from 'eslint-mdx'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import js from '@eslint/js'
import { FlatCompat } from '@eslint/eslintrc'
import eslintignore from './.config/eslintignore.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all,
})

// This is the default eslint config that is used by IDEs. It does not use
// computation-heavy type-checked rules to ensure maximum responsiveness while
// writing code. In addition, there is .eslintrc.cli.json that does use
// type-checked rules in addition to the rules defined here, and it is used
// when running `pnpm lint-eslint` locally or in CI.
export default defineConfig([
  eslintignore,
  {
    files: ['**/*.{js,jsx,mjs,ts,tsx,mts,mdx}'],
    linterOptions: {
      reportUnusedDisableDirectives: 'error',
    },
    plugins: {
      '@typescript-eslint': tseslint.plugin,
      react,
      'react-hooks': reactHooks,
      jest,
      import: fixupPluginRules(_import),
      jsdoc,
    },
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.commonjs,
        ...globals.node,
        ...globals.jest,
      },
      parser: babelParser,
      ecmaVersion: 2020,
      sourceType: 'module',
      parserOptions: {
        requireConfigFile: false,
        ecmaFeatures: {
          jsx: true,
        },
        babelOptions: {
          presets: ['next/babel'],
          caller: {
            supportsTopLevelAwait: true,
          },
        },
      },
    },
    settings: {
      react: {
        version: 'detect',
      },
      'import/internal-regex': '^next/',
    },
    rules: {
      'array-callback-return': 'error',

      'default-case': [
        'error',
        {
          commentPattern: '^no default$',
        },
      ],

      'dot-location': ['error', 'property'],
      eqeqeq: ['error', 'smart'],
      'new-parens': 'error',
      'no-array-constructor': 'error',
      'no-caller': 'error',
      'no-cond-assign': ['error', 'except-parens'],
      'no-const-assign': 'error',
      'no-control-regex': 'error',
      'no-delete-var': 'error',
      'no-dupe-args': 'error',
      'no-dupe-class-members': 'error',
      'no-dupe-keys': 'error',
      'no-duplicate-case': 'error',
      'no-empty-character-class': 'error',
      'no-empty-pattern': 'error',
      'no-eval': 'error',
      'no-ex-assign': 'error',
      'no-extend-native': 'error',
      'no-extra-bind': 'error',
      'no-extra-label': 'error',
      'no-fallthrough': 'error',
      'no-func-assign': 'error',
      'no-implied-eval': 'error',
      'no-invalid-regexp': 'error',
      'no-iterator': 'error',
      'no-label-var': 'error',

      'no-labels': [
        'error',
        {
          allowLoop: true,
          allowSwitch: false,
        },
      ],

      'no-lone-blocks': 'error',
      'no-loop-func': 'error',

      'no-mixed-operators': [
        'error',
        {
          groups: [
            ['&', '|', '^', '~', '<<', '>>', '>>>'],
            ['==', '!=', '===', '!==', '>', '>=', '<', '<='],
            ['&&', '||'],
            ['in', 'instanceof'],
          ],

          allowSamePrecedence: false,
        },
      ],

      'no-multi-str': 'error',
      'no-native-reassign': 'error',
      'no-negated-in-lhs': 'error',
      'no-new-func': 'error',
      'no-new-object': 'error',
      'no-new-symbol': 'error',
      'no-new-wrappers': 'error',
      'no-obj-calls': 'error',
      'no-octal': 'error',
      'no-octal-escape': 'error',
      'no-regex-spaces': 'error',

      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['*/next-devtools/dev-overlay*'],
              message:
                'Use `next/dist/compiled/next-devtools` (`src/next-devtools/dev-overlay/entrypoint.ts`) instead. Prefer `src/next-devtools/shared/` for shared utils.',
            },
          ],
        },
      ],

      'no-restricted-syntax': [
        'error',
        'WithStatement',
        {
          message: 'substr() is deprecated, use slice() or substring() instead',
          selector: "MemberExpression > Identifier[name='substr']",
        },
        {
          selector:
            "BinaryExpression[left.object.name='workUnitStore'][left.property.name='type'][operator=/^(?:===|!==)$/]",
          message:
            'Use an exhaustive switch on `workUnitStore.type` (with a `never`-based default) instead of using if statements or ternaries.',
        },
        {
          selector:
            "BinaryExpression[left.type='ChainExpression'][left.expression.object.name='workUnitStore'][left.expression.property.name='type'][operator=/^(?:===|!==)$/]",
          message:
            'Use an exhaustive switch on `workUnitStore.type` (with a `never`-based default) instead of using if statements or ternaries.',
        },
      ],

      'no-script-url': 'error',
      'no-self-assign': 'error',
      'no-self-compare': 'error',
      'no-sequences': 'error',
      'no-shadow-restricted-names': 'error',
      'no-sparse-arrays': 'error',
      'no-template-curly-in-string': 'error',
      'no-this-before-super': 'error',
      'no-throw-literal': 'error',
      'no-undef': 'error',
      'no-unexpected-multiline': 'error',
      'no-unreachable': 'error',

      'no-unused-expressions': [
        'error',
        {
          allowShortCircuit: true,
          allowTernary: true,
          allowTaggedTemplates: true,
        },
      ],

      'no-unused-labels': 'error',

      'no-unused-vars': [
        'error',
        {
          args: 'none',
          caughtErrors: 'none',
          ignoreRestSiblings: true,
        },
      ],

      'no-use-before-define': 'off',
      'no-useless-computed-key': 'error',
      'no-useless-concat': 'error',
      'no-useless-constructor': 'error',
      'no-useless-escape': 'error',

      'no-useless-rename': [
        'error',
        {
          ignoreDestructuring: false,
          ignoreImport: false,
          ignoreExport: false,
        },
      ],

      'no-with': 'error',
      'no-whitespace-before-property': 'error',
      'react-hooks/exhaustive-deps': 'error',
      'require-yield': 'error',
      'rest-spread-spacing': ['error', 'never'],
      strict: ['error', 'never'],
      'unicode-bom': ['error', 'never'],
      'use-isnan': 'error',
      'valid-typeof': 'error',
      'getter-return': 'error',

      'react/forbid-foreign-prop-types': [
        'error',
        {
          allowInPropTypes: true,
        },
      ],

      'react/jsx-no-comment-textnodes': 'error',
      'react/jsx-no-duplicate-props': 'error',
      'react/jsx-no-target-blank': 'error',
      'react/jsx-no-undef': 'error',

      'react/jsx-pascal-case': [
        'error',
        {
          allowAllCaps: true,
          ignore: [],
        },
      ],

      'react/jsx-uses-react': 'error',
      'react/jsx-uses-vars': 'error',
      'react/no-danger-with-children': 'error',
      'react/no-deprecated': 'error',
      'react/no-direct-mutation-state': 'error',
      'react/no-is-mounted': 'error',
      'react/no-typos': 'error',
      'react/react-in-jsx-scope': 'off',
      'react/require-render-return': 'error',
      'react/style-prop-object': 'error',
      'react-hooks/rules-of-hooks': 'error',
      '@typescript-eslint/prefer-as-const': 'error',

      '@typescript-eslint/no-redeclare': [
        'error',
        {
          builtinGlobals: false,
          ignoreDeclarationMerge: true,
        },
      ],
    },
  },
  {
    files: [
      'test/**/*.js',
      'test/**/*.ts',
      'test/**/*.tsx',
      '**/*.test.ts',
      '**/*.test.tsx',
    ],
    ignores: ['test/tmp/**'],
    extends: compat.extends('plugin:jest/recommended'),
    rules: {
      'jest/expect-expect': 'off',
      'jest/no-disabled-tests': 'off',
      'jest/no-conditional-expect': 'off',
      'jest/valid-title': 'off',
      'jest/no-interpolation-in-snapshots': 'off',
      'jest/no-export': 'off',

      'jest/no-standalone-expect': [
        'error',
        {
          additionalTestBlockFunctions: ['retry', 'itCI', 'itHeaded'],
        },
      ],
    },
  },
  {
    files: ['**/__tests__/**'],
    languageOptions: {
      globals: {
        ...globals.jest,
      },
    },
  },
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.mts'],
    extends: [tseslint.configs.recommended, tseslint.configs.stylistic],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: 'module',
      parserOptions: {
        warnOnUnsupportedTypeScriptVersion: false,
      },
    },
    rules: {
      '@typescript-eslint/array-type': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
      '@typescript-eslint/ban-tslint-comment': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/no-restricted-types': 'off',
      '@typescript-eslint/no-unsafe-function-type': 'off',
      '@typescript-eslint/no-wrapper-object-types': 'off',
      '@typescript-eslint/class-literal-property-style': 'off',
      '@typescript-eslint/consistent-generic-constructors': 'off',
      '@typescript-eslint/consistent-indexed-object-style': 'off',
      '@typescript-eslint/consistent-type-definitions': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/no-namespace': 'off',
      '@typescript-eslint/no-shadow': 'off',
      '@typescript-eslint/no-empty-interface': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-inferrable-types': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-var-requires': 'off',
      '@typescript-eslint/prefer-for-of': 'off',
      '@typescript-eslint/prefer-function-type': 'off',
      '@typescript-eslint/no-this-alias': 'off',
      '@typescript-eslint/triple-slash-reference': 'off',
      'no-var': 'off',
      'prefer-const': 'off',
      'prefer-rest-params': 'off',
      'prefer-spread': 'off',
      'no-unused-expressions': 'off',

      '@typescript-eslint/no-unused-expressions': [
        'error',
        {
          allowShortCircuit: true,
          allowTernary: true,
          allowTaggedTemplates: true,
        },
      ],

      'no-unused-vars': 'off',

      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          args: 'none',
          ignoreRestSiblings: true,
          argsIgnorePattern: '^_',
          caughtErrors: 'none',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],

      'no-use-before-define': 'off',
      'no-useless-constructor': 'off',
      '@typescript-eslint/no-use-before-define': 'off',
      '@typescript-eslint/no-useless-constructor': 'error',
      '@typescript-eslint/prefer-literal-enum-member': 'error',
    },
  },
  {
    files: ['packages/**/*.ts', 'packages/**/*.tsx'],
    plugins: {
      '@next/internal': nextEslintPluginInternal,
    },
    rules: {
      '@next/internal/typechecked-require': 'error',
      'jsdoc/no-types': 'error',
      'jsdoc/no-undefined-types': 'error',
    },
  },
  {
    files: [
      'packages/next/src/server/**/*.js',
      'packages/next/src/server/**/*.jsx',
      'packages/next/src/server/**/*.ts',
      'packages/next/src/server/**/*.tsx',
    ],
    plugins: {
      '@next/internal': nextEslintPluginInternal,
    },
    rules: {
      '@next/internal/no-ambiguous-jsx': 'error',
    },
  },
  {
    files: ['examples/**/*'],
    linterOptions: {
      reportUnusedDisableDirectives: 'off',
    },
    rules: {
      '@typescript-eslint/no-use-before-define': [
        'error',
        {
          functions: true,
          classes: true,
          variables: true,
          enums: true,
          typedefs: true,
        },
      ],

      'import/no-anonymous-default-export': [
        'error',
        {
          allowArrowFunction: false,
          allowAnonymousClass: false,
          allowAnonymousFunction: false,
          allowArray: true,
          allowCallExpression: true,
          allowLiteral: true,
          allowObject: true,
        },
      ],
    },
  },
  {
    files: ['packages/**'],
    ignores: [
      'packages/next/taskfile*.js',
      'packages/next/next-devtools.webpack-config.js',
      'packages/next/next-runtime.webpack-config.js',
    ],
    rules: {
      'no-shadow': [
        'error',
        {
          builtinGlobals: false,
        },
      ],

      'import/no-extraneous-dependencies': [
        'error',
        {
          devDependencies: false,
        },
      ],
    },
  },
  {
    files: ['packages/**/*.tsx', 'packages/**/*.ts'],

    rules: {
      'no-shadow': 'off',

      '@typescript-eslint/no-shadow': [
        'error',
        {
          builtinGlobals: false,
        },
      ],

      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          args: 'all',
          argsIgnorePattern: '^_',
          caughtErrors: 'none',
          ignoreRestSiblings: true,
          varsIgnorePattern: '^_',
        },
      ],
    },
  },
  {
    files: [
      'packages/eslint-plugin-next/**/*.js',
      'test/unit/eslint-plugin-next/**/*.test.ts',
    ],
    extends: compat.extends('plugin:eslint-plugin/recommended'),
    languageOptions: {
      ecmaVersion: 5,
      sourceType: 'script',
    },
    rules: {
      'eslint-plugin/prefer-replace-text': 'error',
      'eslint-plugin/report-message-format': [
        'error',
        '.+\\. See: https://nextjs.org/docs/messages/[a-z\\-]+$',
      ],
      'eslint-plugin/require-meta-docs-description': [
        'error',
        {
          pattern: '.+',
        },
      ],
      'eslint-plugin/require-meta-docs-url': 'error',
    },
  },
  {
    files: ['packages/**/*.tsx', 'packages/**/*.ts'],
    rules: {
      '@typescript-eslint/consistent-type-imports': [
        'error',
        {
          disallowTypeAnnotations: false,
        },
      ],
      '@typescript-eslint/no-import-type-side-effects': 'error',
    },
  },
  {
    files: ['**/*.mdx'],
    extends: compat.extends('plugin:mdx/recommended'),
    languageOptions: {
      parser: mdxParser,
    },
    rules: {
      'react/jsx-no-undef': 'off',
    },
  },
  {
    files: [
      'packages/next/src/next-devtools/dev-overlay/**/*.tsx',
      'packages/next/src/next-devtools/dev-overlay/**/*.ts',
    ],
    extends: [reactHooks.configs.flat['recommended']],
    rules: {
      'react-hooks/exhaustive-deps': 'error',
    },
  },
  {
    // auto-generated file
    files: [
      'packages/next/src/build/swc/generated-native.d.ts',
      'packages/next/src/build/swc/generated-wasm.d.ts',
      'rspack/crates/binding/index.d.ts',
    ],
    linterOptions: {
      reportUnusedDisableDirectives: 'off',
    },
  },
  {
    files: ['turbopack/crates/turbopack-tests/tests/**/*'],
    rules: {
      'no-console': 'off',
    },
  },
])
