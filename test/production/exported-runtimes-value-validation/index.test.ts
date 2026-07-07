import { nextTestSetup } from 'e2e-utils'
import path from 'path'

describe('Exported runtimes value validation', () => {
  describe('invalid-runtime', () => {
    const { next } = nextTestSetup({
      files: path.resolve(__dirname, './invalid-runtime/app'),
      skipStart: true,
    })

    test('fails to build on malformed input', async () => {
      const { exitCode, cliOutput } = await next.build()
      expect(exitCode).toBe(1)
      if (process.env.IS_TURBOPACK_TEST) {
        expect(cliOutput).toContain(
          'runtime` has an invalid value: unknown variant `something-odd`, expected one of `nodejs`, `edge`, `experimental-edge`'
        )
      } else {
        expect(cliOutput).toContain(
          `Invalid enum value. Expected 'edge' | 'experimental-edge' | 'nodejs', received 'something-odd'`
        )
      }
    })
  })

  describe('invalid-middleware', () => {
    const { next } = nextTestSetup({
      files: path.resolve(__dirname, './invalid-middleware'),
      skipStart: true,
    })

    test('fails the build on invalid middleware matcher', async () => {
      const { exitCode, cliOutput } = await next.build()
      expect(exitCode).toBe(1)

      // TODO: Turbopack matches the error message but omits the routing & error information
      if (process.env.IS_TURBOPACK_TEST) {
        expect(cliOutput).toContain(
          "Next.js can't recognize the exported `config` field in route"
        )
        expect(cliOutput).toContain(
          ' Entry `matcher[1]` need to be static strings or static objects.'
        )
      } else {
        expect(cliOutput).toContain(
          'Next.js can\'t recognize the exported `config` field in route "/middleware"'
        )
        expect(cliOutput).toContain(
          'Unknown identifier "dynamicPath" at "config.matcher[1]"'
        )
      }
    })
  })

  describe('unsupported-syntax', () => {
    const { next } = nextTestSetup({
      files: path.resolve(__dirname, './unsupported-syntax/app'),
      skipStart: true,
    })

    test('fails the build on unrecognized runtimes value', async () => {
      const { exitCode, cliOutput } = await next.build()
      expect(exitCode).toBe(1)

      // Template Literal with Expressions
      if (process.env.IS_TURBOPACK_TEST) {
        expect(cliOutput).toContain(
          "Next.js can't recognize the exported `config` field in route"
        )
        // TODO: Turbopack has this information in issue.detail but it's not logged to the user.
        // expect(cliOutput).toContain(
        //   'Unsupported template literal with expressions at "config.runtime".'
        // )
      } else {
        expect(cliOutput).toContain(
          'Next.js can\'t recognize the exported `config` field in route "/template-literal-with-expressions"'
        )
        expect(cliOutput).toContain(
          'Unsupported template literal with expressions at "config.runtime".'
        )
      }

      // Binary Expression
      if (process.env.IS_TURBOPACK_TEST) {
        expect(cliOutput).toContain(
          "Next.js can't recognize the exported `config` field in route"
        )
      } else {
        expect(cliOutput).toContain(
          'Next.js can\'t recognize the exported `config` field in route "/binary-expression"'
        )
        expect(cliOutput).toContain(
          'Unsupported node type "BinaryExpression" at "config.runtime"'
        )
      }

      // Spread Operator within Object Expression
      if (process.env.IS_TURBOPACK_TEST) {
        expect(cliOutput).toContain(
          "Next.js can't recognize the exported `config` field in route"
        )
      } else {
        expect(cliOutput).toContain(
          'Next.js can\'t recognize the exported `config` field in route "/object-spread-operator"'
        )
        expect(cliOutput).toContain(
          'Unsupported spread operator in the Object Expression at "config.runtime"'
        )
      }

      // Spread Operator within Array Expression
      if (process.env.IS_TURBOPACK_TEST) {
        expect(cliOutput).toContain(
          "Next.js can't recognize the exported `config` field in route"
        )
      } else {
        expect(cliOutput).toContain(
          'Next.js can\'t recognize the exported `config` field in route "/array-spread-operator"'
        )
        expect(
          cliOutput.match(/field in route "\/array-spread-operator"/g)?.length
        ).toBe(1)
        expect(cliOutput).toContain(
          'Unsupported spread operator in the Array Expression at "config.runtime"'
        )
      }

      // Unknown Identifier
      if (process.env.IS_TURBOPACK_TEST) {
        expect(cliOutput).toContain(
          "Next.js can't recognize the exported `config` field in route"
        )
      } else {
        expect(cliOutput).toContain(
          'Next.js can\'t recognize the exported `config` field in route "/invalid-identifier"'
        )
        expect(cliOutput).toContain(
          'Unknown identifier "runtime" at "config.runtime".'
        )
      }

      // Unknown Expression Type
      if (process.env.IS_TURBOPACK_TEST) {
        expect(cliOutput).toContain(
          "Next.js can't recognize the exported `config` field in route"
        )
      } else {
        expect(cliOutput).toContain(
          'Next.js can\'t recognize the exported `config` field in route "/unsupported-value-type"'
        )
        expect(cliOutput).toContain(
          'Unsupported node type "CallExpression" at "config.runtime"'
        )
      }

      // Unknown Object Key
      if (process.env.IS_TURBOPACK_TEST) {
        expect(cliOutput).toContain(
          "Next.js can't recognize the exported `config` field in route"
        )
      } else {
        expect(cliOutput).toContain(
          'Next.js can\'t recognize the exported `config` field in route "/unsupported-object-key"'
        )
        expect(cliOutput).toContain(
          'Unsupported key type "Computed" in the Object Expression at "config.runtime"'
        )
      }
    })
  })
})
