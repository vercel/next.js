const { RuleTester } = require('eslint')
const rule = require('./eslint-error-subclass-static-name')

const ruleTester = new RuleTester({
  languageOptions: {
    parser: require('@typescript-eslint/parser'),
    parserOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
    },
  },
})

describe('error-subclass-static-name ESLint rule', () => {
  ruleTester.run('error-subclass-static-name', rule, {
    valid: [
      // Not extending anything.
      {
        code: `class Foo {}`,
        filename: 'test.ts',
      },
      // Parent name does not end with Error.
      {
        code: `class Foo extends Bar {}`,
        filename: 'test.ts',
      },
      // Direct extends Error with matching static name.
      {
        code: `class FooError extends Error { static name = 'FooError' }`,
        filename: 'test.ts',
      },
      // Annotated form is also accepted — rule only checks the literal value.
      {
        code: `class FooError extends Error { static name: string = 'FooError' }`,
        filename: 'test.ts',
      },
      // Chained subclass with matching static name.
      {
        code: `class FooError extends BaseError { static name = 'FooError' }`,
        filename: 'test.ts',
      },
      // Anonymous class — no id to preserve.
      {
        code: `const X = class extends Error {}`,
        filename: 'test.ts',
      },
      // Static name with other members already present.
      {
        code: `class FooError extends Error {
  static name = 'FooError'
  message = 'boom'
}`,
        filename: 'test.ts',
      },
      // Non-identifier superclass (e.g. member expression) — skipped.
      {
        code: `class FooError extends ns.Error {}`,
        filename: 'test.ts',
      },
    ],

    invalid: [
      // Direct Error subclass missing static name.
      {
        code: `class FooError extends Error {}`,
        filename: 'test.ts',
        errors: [
          {
            messageId: 'missingStaticName',
            data: { className: 'FooError' },
          },
        ],
        output: `class FooError extends Error {\n  static name = 'FooError'\n}`,
      },
      // Chained *Error parent, missing static name.
      {
        code: `class FooError extends BaseError {}`,
        filename: 'test.ts',
        errors: [
          {
            messageId: 'missingStaticName',
            data: { className: 'FooError' },
          },
        ],
        output: `class FooError extends BaseError {\n  static name = 'FooError'\n}`,
      },
      // Child name doesn't end with Error; parent is Error — still flagged.
      {
        code: `class Foo extends Error {}`,
        filename: 'test.ts',
        errors: [
          {
            messageId: 'missingStaticName',
            data: { className: 'Foo' },
          },
        ],
        output: `class Foo extends Error {\n  static name = 'Foo'\n}`,
      },
      // Wrong static name literal.
      {
        code: `class FooError extends Error { static name = 'Wrong' }`,
        filename: 'test.ts',
        errors: [
          {
            messageId: 'mismatchedName',
            data: { className: 'FooError' },
          },
        ],
        output: `class FooError extends Error { static name = 'FooError' }`,
      },
      // Static name with no initializer.
      {
        code: `class FooError extends Error { static name }`,
        filename: 'test.ts',
        errors: [
          {
            messageId: 'mismatchedName',
            data: { className: 'FooError' },
          },
        ],
        output: `class FooError extends Error { static name = 'FooError' }`,
      },
      // Existing members — fixer inserts at top.
      {
        code: `class FooError extends Error {
  message = 'boom'
}`,
        filename: 'test.ts',
        errors: [
          {
            messageId: 'missingStaticName',
            data: { className: 'FooError' },
          },
        ],
        output: `class FooError extends Error {\n  static name = 'FooError'\n
  message = 'boom'
}`,
      },
      // Class expression with a name.
      {
        code: `const X = class FooError extends Error {}`,
        filename: 'test.ts',
        errors: [
          {
            messageId: 'missingStaticName',
            data: { className: 'FooError' },
          },
        ],
        output: `const X = class FooError extends Error {\n  static name = 'FooError'\n}`,
      },
    ],
  })
})
