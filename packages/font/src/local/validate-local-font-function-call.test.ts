import { validateLocalFontFunctionCall } from './validate-local-font-function-call'

describe('validateLocalFontFunctionCall', () => {
  test('Not using default export', async () => {
    expect(() =>
      validateLocalFontFunctionCall('Named', {})
    ).toThrowErrorMatchingInlineSnapshot(
      `"next/font/local has no named exports"`
    )
  })

  test('Missing src', async () => {
    expect(() =>
      validateLocalFontFunctionCall('', {})
    ).toThrowErrorMatchingInlineSnapshot(`"Missing required \`src\` property"`)
  })

  test('Invalid file extension', async () => {
    expect(() =>
      validateLocalFontFunctionCall('', { src: './font/font-file.abc' })
    ).toThrowErrorMatchingInlineSnapshot(
      `"Unexpected file \`./font/font-file.abc\`"`
    )
  })

  test('Invalid display value', async () => {
    expect(() =>
      validateLocalFontFunctionCall('', {
        src: './font-file.woff2',
        display: 'invalid',
      })
    ).toThrowErrorMatchingInlineSnapshot(`
      "Invalid display value \`invalid\`.
      Available display values: \`auto\`, \`block\`, \`swap\`, \`fallback\`, \`optional\`"
    `)
  })

  test('Invalid declaration', async () => {
    expect(() =>
      validateLocalFontFunctionCall('', {
        src: './font-file.woff2',
        declarations: [{ prop: 'src', value: '/hello.woff2' }],
      })
    ).toThrowErrorMatchingInlineSnapshot(`"Invalid declaration prop: \`src\`"`)
  })

  test('Empty src array', async () => {
    expect(() =>
      validateLocalFontFunctionCall('', {
        src: [],
      })
    ).toThrowErrorMatchingInlineSnapshot(`"Unexpected empty \`src\` array."`)
  })
})
