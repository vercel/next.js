const { RuleTester } = require('eslint')
const rule = require('./eslint-require-disable-reason')

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

// The tests guard core rules, so the disable comments refer to rules that
// RuleTester knows about.
const options = [{ rules: ['no-console', 'no-debugger'] }]

describe('require-disable-reason ESLint rule', () => {
  ruleTester.run('require-disable-reason', rule, {
    valid: [
      {
        code: `
          // Prints the build summary.
          // eslint-disable-next-line no-console
          console.log(summary)
        `,
        options,
      },
      {
        code: `
          // The summary is the only output of this script, and it goes to
          // stdout so other tools can pipe it.
          // eslint-disable-next-line no-console
          console.log(summary)
        `,
        options,
      },
      {
        code: `
          /* Prints the build summary. */
          // eslint-disable-next-line no-console
          console.log(summary)
        `,
        options,
      },
      {
        code: `
          /**
           * Prints the build summary.
           */
          // eslint-disable-next-line no-console
          console.log(summary)
        `,
        options,
      },
      {
        // Prettier puts comments on a ternary branch after the \`?\` or \`:\`.
        code: `
          const log = verbose
            ? // Prints the build summary.
              // eslint-disable-next-line no-console
              () => console.log(summary)
            : () => {}
        `,
        options,
      },
      {
        code: `
          // eslint-disable-next-line no-console -- prints the build summary
          console.log(summary)
        `,
        options,
      },
      {
        code: `console.log(summary) // eslint-disable-line no-console -- prints the build summary`,
        options,
      },
      {
        code: `
          /* eslint-disable-next-line no-console -- prints the build summary */
          console.log(summary)
        `,
        options,
      },
      {
        // The marker used for casts that predate the rule.
        code: `
          // TODO(as-any): pre-existing cast, not yet reviewed
          // eslint-disable-next-line no-console
          console.log(summary)
        `,
        options,
      },
      {
        // Rules that aren't guarded don't need a reason.
        code: `
          // eslint-disable-next-line no-alert
          alert(summary)
        `,
        options,
      },
      {
        code: `
          /* eslint-disable no-alert */
          alert(summary)
        `,
        options,
      },
      {
        code: `
          const el = (
            <div>
              {/* eslint-disable-next-line no-console -- logs render order in this fixture */}
              {console.log('render')}
            </div>
          )
        `,
        options,
      },
      {
        code: `
          const el = (
            <div>
              {/* Logs render order in this fixture. */}
              {/* eslint-disable-next-line no-console */}
              {console.log('render')}
            </div>
          )
        `,
        options,
      },
      {
        // Not a directive: ESLint only honors the block form of
        // `eslint-disable`.
        code: `
          // eslint-disable no-console
          const a = 1
        `,
        options,
      },
      {
        code: `// a comment that mentions eslint-disable-next-line no-console`,
        options,
      },
    ],
    invalid: [
      {
        code: `
          // eslint-disable-next-line no-console
          console.log(summary)
        `,
        options,
        errors: [{ messageId: 'missingReason', data: { rules: 'no-console' } }],
      },
      {
        code: `console.log(summary) // eslint-disable-line no-console`,
        options,
        errors: [{ messageId: 'missingReason' }],
      },
      {
        // Only the guarded rules are named in the message.
        code: `
          // eslint-disable-next-line no-alert, no-console
          alert(console.log(summary))
        `,
        options,
        errors: [{ messageId: 'missingReason', data: { rules: 'no-console' } }],
      },
      {
        // A directive with no rule list turns off the guarded rules too.
        code: `
          // eslint-disable-next-line
          console.log(summary)
        `,
        options,
        errors: [
          {
            messageId: 'missingReason',
            data: { rules: 'no-console, no-debugger' },
          },
        ],
      },
      {
        code: `
          // eslint-disable-next-line no-console -- TODO fix this
          console.log(summary)
        `,
        options,
        errors: [{ messageId: 'vagueReason' }],
      },
      {
        code: `
          // eslint-disable-next-line no-console -- needed for types
          console.log(summary)
        `,
        options,
        errors: [{ messageId: 'vagueReason' }],
      },
      {
        code: `
          // TODO fix this
          // eslint-disable-next-line no-console
          console.log(summary)
        `,
        options,
        errors: [{ messageId: 'vagueReason' }],
      },
      {
        // A blank line separates the comment from the disable comment.
        code: `
          // Prints the build summary.

          // eslint-disable-next-line no-console
          console.log(summary)
        `,
        options,
        errors: [{ messageId: 'missingReason' }],
      },
      {
        // A comment trailing code on the line above isn't a reason.
        code: `
          const summary = getSummary() // prints the build summary
          // eslint-disable-next-line no-console
          console.log(summary)
        `,
        options,
        errors: [{ messageId: 'missingReason' }],
      },
      {
        // Tool directives aren't reasons.
        code: `
          // @ts-expect-error summary is untyped
          // eslint-disable-next-line no-console
          console.log(summary)
        `,
        options,
        errors: [{ messageId: 'missingReason' }],
      },
      {
        // A trailing disable comment takes its reason after \` -- \`; a
        // comment above the code line doesn't count.
        code: `
          // Prints the build summary.
          console.log(summary) // eslint-disable-line no-console
        `,
        options,
        errors: [{ messageId: 'missingReason' }],
      },
      {
        code: `
          /* eslint-disable no-console -- prints the build summary */
          console.log(summary)
        `,
        options,
        errors: [{ messageId: 'rangeDisable' }],
      },
    ],
  })
})
