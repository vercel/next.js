const { RuleTester } = require('eslint')
const rule = require('./eslint-no-as-any')

const ruleTester = new RuleTester({
  languageOptions: {
    parser: require('@typescript-eslint/parser'),
    parserOptions: {
      ecmaVersion: 2020,
      sourceType: 'module',
      ecmaFeatures: { jsx: true },
    },
  },
})

describe('no-as-any ESLint rule', () => {
  ruleTester.run('no-as-any', rule, {
    valid: [
      { code: `const a = value as string`, filename: 'test.ts' },
      { code: `const a = value as unknown`, filename: 'test.ts' },
      { code: `const a = value as unknown as string`, filename: 'test.ts' },
      { code: `const a = value satisfies string`, filename: 'test.ts' },
      { code: `const a = [1, 2] as const`, filename: 'test.ts' },
      { code: `const a = <string>value`, filename: 'test.ts' },
      { code: `let a: any = value`, filename: 'test.ts' },
      { code: `const a = value as Array<any>`, filename: 'test.ts' },
      { code: `const a = value as Record<string, any>`, filename: 'test.ts' },
    ],
    invalid: [
      {
        code: `const a = value as any`,
        filename: 'test.ts',
        errors: [{ messageId: 'asAny', line: 1, column: 20 }],
      },
      {
        code: `;(err as any).code = 'BABEL_PARSE_ERROR'`,
        filename: 'test.ts',
        errors: [{ messageId: 'asAny' }],
      },
      {
        code: `const a = value as any as string`,
        filename: 'test.ts',
        errors: [{ messageId: 'asAny' }],
      },
      {
        code: `const a = <any>value`,
        filename: 'test.ts',
        errors: [{ messageId: 'asAny' }],
      },
      {
        code: `const el = <Comp prop={value as any} />`,
        filename: 'test.tsx',
        errors: [{ messageId: 'asAny' }],
      },
      {
        code: `foo(a as any, b as any)`,
        filename: 'test.ts',
        errors: [{ messageId: 'asAny' }, { messageId: 'asAny' }],
      },
      {
        // The report lands on the line of the `any` keyword, so a
        // `eslint-disable-next-line` above that line covers it.
        code: ['const a = (', '  someCall(', '    arg', '  ) as any', ')'].join(
          '\n'
        ),
        filename: 'test.ts',
        errors: [{ messageId: 'asAny', line: 4 }],
      },
    ],
  })
})
