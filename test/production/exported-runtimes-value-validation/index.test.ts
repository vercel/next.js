import { nextBuild } from 'next-test-utils'
import path from 'path'

describe('Exported runtimes value validation', () => {
  test('fails to build on malformed input', async () => {
    const result = await nextBuild(
      path.resolve(__dirname, './invalid-runtime/app'),
      undefined,
      { stdout: true, stderr: true }
    )
    expect(result).toMatchObject({
      code: 1,
      stderr: process.env.IS_TURBOPACK_TEST
        ? expect.stringContaining(
            'runtime` has an invalid value: unknown variant `something-odd`, expected one of `nodejs`, `edge`, `experimental-edge`'
          )
        : expect.stringContaining(
            `Invalid enum value. Expected 'edge' | 'experimental-edge' | 'nodejs', received 'something-odd'`
          ),
    })
  })

  test('fails the build on invalid middleware matcher', async () => {
    const result = await nextBuild(
      path.resolve(__dirname, './invalid-middleware'),
      undefined,
      { stdout: true, stderr: true }
    )

    // The build should fail to prevent unexpected behavior
    expect(result.code).toBe(1)

    // TODO: Turbopack matches the error message but omits the routing & error information
    if (process.env.IS_TURBOPACK_TEST) {
      expect(result.stderr).toEqual(
        expect.stringContaining(
          "Next.js can't recognize the exported `config` field in route"
        )
      )
      expect(result.stderr).toEqual(
        expect.stringContaining(
          ' Entry `matcher[1]` need to be static strings or static objects.'
        )
      )
    } else {
      expect(result.stderr).toEqual(
        expect.stringContaining(
          'Next.js can\'t recognize the exported `config` field in route "/middleware"'
        )
      )

      expect(result.stderr).toEqual(
        expect.stringContaining(
          'Unknown identifier "dynamicPath" at "config.matcher[1]"'
        )
      )
    }
  })

  test('fails the build on unrecognized runtimes value', async () => {
    const result = await nextBuild(
      path.resolve(__dirname, './unsupported-syntax/app'),
      undefined,
      { stdout: true, stderr: true }
    )

    // The build should fail to prevent unexpected behavior
    expect(result.code).toBe(1)

    // Template Literal with Expressions
    if (process.env.IS_TURBOPACK_TEST) {
      expect(result.stderr).toEqual(
        expect.stringContaining(
          "Next.js can't recognize the exported `config` field in route"
        )
      )
      // TODO: Turbopack has this information in issue.detail but it's not logged to the user.
      // expect(result.stderr).toEqual(
      //   expect.stringContaining(
      //     'Unsupported template literal with expressions at "config.runtime".'
      //   )
      // )
    } else {
      expect(result.stderr).toEqual(
        expect.stringContaining(
          'Next.js can\'t recognize the exported `config` field in route "/template-literal-with-expressions"'
        )
      )
      expect(result.stderr).toEqual(
        expect.stringContaining(
          'Unsupported template literal with expressions at "config.runtime".'
        )
      )
    }

    // Binary Expression
    if (process.env.IS_TURBOPACK_TEST) {
      expect(result.stderr).toEqual(
        expect.stringContaining(
          "Next.js can't recognize the exported `config` field in route"
        )
      )
      // TODO: Turbopack has this information in issue.detail but it's not logged to the user.
      // expect(result.stderr).toEqual(
      //   expect.stringContaining(
      //     'Unsupported node type "BinaryExpression" at "config.runtime"'
      //   )
      // )
    } else {
      expect(result.stderr).toEqual(
        expect.stringContaining(
          'Next.js can\'t recognize the exported `config` field in route "/binary-expression"'
        )
      )
      expect(result.stderr).toEqual(
        expect.stringContaining(
          'Unsupported node type "BinaryExpression" at "config.runtime"'
        )
      )
    }

    // Spread Operator within Object Expression
    if (process.env.IS_TURBOPACK_TEST) {
      expect(result.stderr).toEqual(
        expect.stringContaining(
          "Next.js can't recognize the exported `config` field in route"
        )
      )
      // TODO: Turbopack has this information in issue.detail but it's not logged to the user.
      // expect(result.stderr).toEqual(
      //   expect.stringContaining(
      //     'Unsupported spread operator in the Object Expression at "config.runtime"'
      //   )
      // )
    } else {
      expect(result.stderr).toEqual(
        expect.stringContaining(
          'Next.js can\'t recognize the exported `config` field in route "/object-spread-operator"'
        )
      )
      expect(result.stderr).toEqual(
        expect.stringContaining(
          'Unsupported spread operator in the Object Expression at "config.runtime"'
        )
      )
    }

    // Spread Operator within Array Expression
    if (process.env.IS_TURBOPACK_TEST) {
      expect(result.stderr).toEqual(
        expect.stringContaining(
          "Next.js can't recognize the exported `config` field in route"
        )
      )
      // TODO: Turbopack has this information in issue.detail but it's not logged to the user.
      // expect(result.stderr).toEqual(
      //   expect.stringContaining(
      //     'Unsupported spread operator in the Array Expression at "config.runtime"'
      //   )
      // )
    } else {
      expect(result.stderr).toEqual(
        expect.stringContaining(
          'Next.js can\'t recognize the exported `config` field in route "/array-spread-operator"'
        )
      )
      // ensure only 1 occurrence of the log
      expect(
        result.stderr.match(/field in route "\/array-spread-operator"/g)?.length
      ).toBe(1)
      expect(result.stderr).toEqual(
        expect.stringContaining(
          'Unsupported spread operator in the Array Expression at "config.runtime"'
        )
      )
    }

    // Unknown Identifier
    if (process.env.IS_TURBOPACK_TEST) {
      expect(result.stderr).toEqual(
        expect.stringContaining(
          "Next.js can't recognize the exported `config` field in route"
        )
      )
      // TODO: Turbopack has this information in issue.detail but it's not logged to the user.
      // expect(result.stderr).toEqual(
      //   expect.stringContaining(
      //     'Unknown identifier "runtime" at "config.runtime".'
      //   )
      // )
    } else {
      expect(result.stderr).toEqual(
        expect.stringContaining(
          'Next.js can\'t recognize the exported `config` field in route "/invalid-identifier"'
        )
      )
      expect(result.stderr).toEqual(
        expect.stringContaining(
          'Unknown identifier "runtime" at "config.runtime".'
        )
      )
    }

    // Unknown Expression Type
    if (process.env.IS_TURBOPACK_TEST) {
      expect(result.stderr).toEqual(
        expect.stringContaining(
          "Next.js can't recognize the exported `config` field in route"
        )
      )
      // TODO: Turbopack has this information in issue.detail but it's not logged to the user.
      // expect(result.stderr).toEqual(
      //   expect.stringContaining(
      //     'Unsupported node type "CallExpression" at "config.runtime"'
      //   )
      // )
    } else {
      expect(result.stderr).toEqual(
        expect.stringContaining(
          'Next.js can\'t recognize the exported `config` field in route "/unsupported-value-type"'
        )
      )
      expect(result.stderr).toEqual(
        expect.stringContaining(
          'Unsupported node type "CallExpression" at "config.runtime"'
        )
      )
    }

    // Unknown Object Key
    if (process.env.IS_TURBOPACK_TEST) {
      expect(result.stderr).toEqual(
        expect.stringContaining(
          "Next.js can't recognize the exported `config` field in route"
        )
      )
      // TODO: Turbopack has this information in issue.detail but it's not logged to the user.
      // expect(result.stderr).toEqual(
      //   expect.stringContaining(
      //     'Unsupported key type "Computed" in the Object Expression at "config.runtime"'
      //   )
      // )
    } else {
      expect(result.stderr).toEqual(
        expect.stringContaining(
          'Next.js can\'t recognize the exported `config` field in route "/unsupported-object-key"'
        )
      )
      expect(result.stderr).toEqual(
        expect.stringContaining(
          'Unsupported key type "Computed" in the Object Expression at "config.runtime"'
        )
      )
    }
  })
})
