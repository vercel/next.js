import loader from '@next/font/google/loader'

const self: any = global

describe('@next/font/google loader', () => {
  beforeEach(() => {
    self.fetch = jest.fn()
  })

  describe('URL from options', () => {
    test.each([
      [
        'Inter',
        [],
        'https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=optional',
      ],
      [
        'Inter',
        [{ variant: '400' }],
        'https://fonts.googleapis.com/css2?family=Inter:wght@400&display=optional',
      ],
      [
        'Inter',
        [{ variant: '900', display: 'block' }],
        'https://fonts.googleapis.com/css2?family=Inter:wght@900&display=block',
      ],
      [
        'Source_Sans_Pro',
        [{ variant: '900', display: 'auto' }],
        'https://fonts.googleapis.com/css2?family=Source+Sans+Pro:wght@900&display=auto',
      ],
      [
        'Source_Sans_Pro',
        [{ variant: '200-italic' }],
        'https://fonts.googleapis.com/css2?family=Source+Sans+Pro:ital,wght@1,200&display=optional',
      ],
      [
        'Roboto_Flex',
        [{ display: 'swap' }],
        'https://fonts.googleapis.com/css2?family=Roboto+Flex:wght@100..1000&display=swap',
      ],
      [
        'Roboto_Flex',
        [{ display: 'fallback', variant: 'variable', axes: ['opsz'] }],
        'https://fonts.googleapis.com/css2?family=Roboto+Flex:opsz,wght@8..144,100..1000&display=fallback',
      ],
      [
        'Roboto_Flex',
        [
          {
            display: 'optional',
            axes: ['YTUC', 'slnt', 'wdth', 'opsz', 'XTRA', 'YTAS'],
          },
        ],
        'https://fonts.googleapis.com/css2?family=Roboto+Flex:opsz,slnt,wdth,wght,XTRA,YTAS,YTUC@8..144,-10..0,25..151,100..1000,323..603,649..854,528..760&display=optional',
      ],
      [
        'Oooh_Baby',
        [{ variant: '400' }],
        'https://fonts.googleapis.com/css2?family=Oooh+Baby:wght@400&display=optional',
      ],
      [
        'Albert_Sans',
        [{ variant: 'variable-italic' }],
        'https://fonts.googleapis.com/css2?family=Albert+Sans:ital,wght@1,100..900&display=optional',
      ],
      [
        'Fraunces',
        [{ variant: 'variable-italic', axes: ['WONK', 'opsz', 'SOFT'] }],
        'https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght,SOFT,WONK@1,9..144,100..900,0..100,0..1&display=optional',
      ],
    ])('%s', async (functionName: string, data: any, url: string) => {
      self.fetch.mockResolvedValue({
        ok: true,
        text: async () => 'OK',
      })
      const { css } = await loader({
        functionName,
        data,
        config: { subsets: [] },
        emitFontFile: jest.fn(),
      })
      expect(css).toBe('OK')
      expect(self.fetch).toHaveBeenCalledTimes(1)
      expect(self.fetch).toHaveBeenCalledWith(url, expect.any(Object))
    })
  })

  describe('Errors', () => {
    test('Failed to fetch', async () => {
      self.fetch.mockResolvedValue({
        ok: false,
      })

      await expect(
        loader({
          functionName: 'Inter',
          data: [],
          config: { subsets: [] },
          emitFontFile: jest.fn(),
        })
      ).rejects.toThrowErrorMatchingInlineSnapshot(`
          "Failed to fetch font  \`Inter\`.
          URL: https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=optional"
        `)
    })

    test('Missing config with subsets', async () => {
      await expect(
        loader({
          functionName: 'Inter',
          data: [],
          config: undefined,
          emitFontFile: jest.fn(),
        })
      ).rejects.toThrowErrorMatchingInlineSnapshot(
        `"Please specify subsets for \`@next/font/google\` in your \`next.config.js\`"`
      )
    })

    test('Missing function name', async () => {
      await expect(
        loader({
          functionName: '', // default import
          data: [],
          config: { subsets: [] },
          emitFontFile: jest.fn(),
        })
      ).rejects.toThrowErrorMatchingInlineSnapshot(
        `"@next/font/google has no default export"`
      )
    })

    test('Unknown font', async () => {
      await expect(
        loader({
          functionName: 'Unknown_Font',
          data: [],
          config: { subsets: [] },
          emitFontFile: jest.fn(),
        })
      ).rejects.toThrowErrorMatchingInlineSnapshot(
        `"Unknown font \`Unknown Font\`"`
      )
    })

    test('Unknown variant', async () => {
      await expect(
        loader({
          functionName: 'Inter',
          data: [{ variant: '123' }],
          config: { subsets: [] },
          emitFontFile: jest.fn(),
        })
      ).rejects.toThrowErrorMatchingInlineSnapshot(`
        "Unknown variant \`123\` for font \`Inter\`.
        Available variants: \`100\`, \`200\`, \`300\`, \`400\`, \`500\`, \`600\`, \`700\`, \`800\`, \`900\`, \`variable\`"
      `)
    })

    test('Missing default variant', async () => {
      await expect(
        loader({
          functionName: 'Inter',
          data: [],
          config: { subsets: [] },
          emitFontFile: jest.fn(),
        })
      ).rejects.toThrowErrorMatchingInlineSnapshot(
        `"Cannot read properties of undefined (reading 'ok')"`
      )
    })

    test('Invalid display value', async () => {
      await expect(
        loader({
          functionName: 'Inter',
          data: [{ display: 'unvalid' }],
          config: { subsets: [] },
          emitFontFile: jest.fn(),
        })
      ).rejects.toThrowErrorMatchingInlineSnapshot(`
        "Invalid display value \`unvalid\` for font \`Inter\`.
        Available display values: \`auto\`, \`block\`, \`swap\`, \`fallback\`, \`optional\`"
      `)
    })

    test('Setting axes on non variable font', async () => {
      await expect(
        loader({
          functionName: 'Abel',
          data: [{ variant: '400', axes: [] }],
          config: { subsets: [] },
          emitFontFile: jest.fn(),
        })
      ).rejects.toThrowErrorMatchingInlineSnapshot(
        `"Axes can only be defined for variable fonts"`
      )
    })

    test('Setting axes on font without definable axes', async () => {
      await expect(
        loader({
          functionName: 'Lora',
          data: [{ axes: [] }],
          config: { subsets: [] },
          emitFontFile: jest.fn(),
        })
      ).rejects.toThrowErrorMatchingInlineSnapshot(
        `"Font \`Lora\` has no definable \`axes\`"`
      )
    })

    test('Invalid axes value', async () => {
      await expect(
        loader({
          functionName: 'Inter',
          data: [{ axes: true }],
          config: { subsets: [] },
          emitFontFile: jest.fn(),
        })
      ).rejects.toThrowErrorMatchingInlineSnapshot(`
              "Invalid axes value for font \`Inter\`, expected an array of axes.
              Available axes: \`slnt\`"
            `)
    })

    test('Invalid value in axes array', async () => {
      await expect(
        loader({
          functionName: 'Roboto_Flex',
          data: [{ axes: ['INVALID'] }],
          config: { subsets: [] },
          emitFontFile: jest.fn(),
        })
      ).rejects.toThrowErrorMatchingInlineSnapshot(`
              "Invalid axes value \`INVALID\` for font \`Roboto Flex\`.
              Available axes: \`GRAD\`, \`XTRA\`, \`YOPQ\`, \`YTAS\`, \`YTDE\`, \`YTFI\`, \`YTLC\`, \`YTUC\`, \`opsz\`, \`slnt\`, \`wdth\`"
            `)
    })
  })
})
