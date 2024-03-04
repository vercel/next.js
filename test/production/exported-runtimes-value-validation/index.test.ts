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
      stderr: expect.stringContaining(
        `Provided runtime "something-odd" is not supported.`
      ),
    })
  })

  test('warns on unrecognized runtimes value', async () => {
    const result = await nextBuild(
      path.resolve(__dirname, './unsupported-syntax/app'),
      undefined,
      { stdout: true, stderr: true }
    )

    console.log(result.stderr, result.stdout)

    // The build should still succeed with invalid config being ignored
    expect(result.code).toBe(0)

    // Template Literal with Expressions
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
    // Binary Expression
    expect(result.stderr).toEqual(
      expect.stringContaining(
        'Next.js can\'t recognize the exported `config` field in route "/binary-expression"'
      )
    )
    expect(result.stderr).toEqual(
      expect.stringContaining('Unsupported node type at "config.runtime"')
    )
    // Spread Operator within Object Expression
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
    // Spread Operator within Array Expression
    expect(result.stderr).toEqual(
      expect.stringContaining(
        'Next.js can\'t recognize the exported `config` field in route "/array-spread-operator"'
      )
    )
    expect(result.stderr).toEqual(
      expect.stringContaining(
        'Unsupported spread operator in the Array Expression at "config.runtime"'
      )
    )
    // Unknown Identifier
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
    // Unknown Expression Type
    expect(result.stderr).toEqual(
      expect.stringContaining(
        'Next.js can\'t recognize the exported `config` field in route "/unsupported-value-type"'
      )
    )
    expect(result.stderr).toEqual(
      expect.stringContaining('Unsupported node type at "config.runtime"')
    )
    // Unknown Object Key
    expect(result.stderr).toEqual(
      expect.stringContaining(
        'Next.js can\'t recognize the exported `config` field in route "/unsupported-object-key"'
      )
    )
    expect(result.stderr).toEqual(
      expect.stringContaining(
        'Unsupported key type in the Object Expression at "config.runtime"'
      )
    )
  })
})
