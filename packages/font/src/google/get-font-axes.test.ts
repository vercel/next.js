import { getFontAxes } from './get-font-axes'

describe('getFontAxes errors', () => {
  test('Setting axes on font without definable axes', () => {
    expect(() =>
      getFontAxes('Lora', ['variable'], [], [])
    ).toThrowErrorMatchingInlineSnapshot(
      `"Font \`Lora\` has no definable \`axes\`"`
    )
  })

  test('Invalid axes value', async () => {
    expect(() => getFontAxes('Inter', ['variable'], [], true as any))
      .toThrowErrorMatchingInlineSnapshot(`
      "Invalid axes value for font \`Inter\`, expected an array of axes.
      Available axes: \`slnt\`"
    `)
  })

  test('Invalid value in axes array', async () => {
    expect(() => getFontAxes('Roboto Flex', ['variable'], [], ['INVALID']))
      .toThrowErrorMatchingInlineSnapshot(`
      "Invalid axes value \`INVALID\` for font \`Roboto Flex\`.
      Available axes: \`GRAD\`, \`XTRA\`, \`YOPQ\`, \`YTAS\`, \`YTDE\`, \`YTFI\`, \`YTLC\`, \`YTUC\`, \`opsz\`, \`slnt\`, \`wdth\`"
    `)
  })
})
