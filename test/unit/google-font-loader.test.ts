import loader from '@next/font/google/loader'
import fetch from 'next/dist/compiled/node-fetch'

jest.mock('next/dist/compiled/node-fetch')

describe('@next/font/google loader', () => {
  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('URL from options', () => {
    test.each([
      [
        'Inter',
        {},
        'https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=optional',
      ],
      [
        'Inter',
        { variant: '400' },
        'https://fonts.googleapis.com/css2?family=Inter:wght@400&display=optional',
      ],
      [
        'Inter',
        { variant: '900', display: 'block' },
        'https://fonts.googleapis.com/css2?family=Inter:wght@900&display=block',
      ],
      [
        'Source_Sans_Pro',
        { variant: '900', display: 'auto' },
        'https://fonts.googleapis.com/css2?family=Source+Sans+Pro:wght@900&display=auto',
      ],
      [
        'Source_Sans_Pro',
        { variant: '200-italic' },
        'https://fonts.googleapis.com/css2?family=Source+Sans+Pro:ital,wght@1,200&display=optional',
      ],
      [
        'Roboto_Flex',
        { display: 'swap' },
        'https://fonts.googleapis.com/css2?family=Roboto+Flex:wght@100..1000&display=swap',
      ],
      [
        'Roboto_Flex',
        { display: 'fallback', variant: 'variable', axes: ['opsz'] },
        'https://fonts.googleapis.com/css2?family=Roboto+Flex:opsz,wght@8..144,100..1000&display=fallback',
      ],
      [
        'Roboto_Flex',
        {
          display: 'optional',
          axes: ['YTUC', 'slnt', 'wdth', 'opsz', 'XTRA', 'YTAS'],
        },
        'https://fonts.googleapis.com/css2?family=Roboto+Flex:opsz,slnt,wdth,wght,XTRA,YTAS,YTUC@8..144,-10..0,25..151,100..1000,323..603,649..854,528..760&display=optional',
      ],
      [
        'Oooh_Baby',
        { variant: '400' },
        'https://fonts.googleapis.com/css2?family=Oooh+Baby:wght@400&display=optional',
      ],
      [
        'Albert_Sans',
        { variant: 'variable-italic' },
        'https://fonts.googleapis.com/css2?family=Albert+Sans:ital,wght@1,100..900&display=optional',
      ],
      [
        'Fraunces',
        { variant: 'variable-italic', axes: ['WONK', 'opsz', 'SOFT'] },
        'https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght,SOFT,WONK@1,9..144,100..900,0..100,0..1&display=optional',
      ],
    ])('%s', async (functionName: string, data: any, url: string) => {
      fetch.mockResolvedValue({
        ok: true,
        text: async () => 'OK',
      })
      const { css } = await loader({
        functionName,
        data: [{ adjustFontFallback: false, ...data }],
        config: { subsets: [] },
        emitFontFile: jest.fn(),
        resolve: jest.fn(),
        fs: {} as any,
      })
      expect(css).toBe('OK')
      expect(fetch).toHaveBeenCalledTimes(1)
      expect(fetch).toHaveBeenCalledWith(url, expect.any(Object))
    })
  })

  describe('Fallback fonts', () => {
    test('Inter', async () => {
      fetch.mockResolvedValue({
        ok: true,
        text: async () => '',
      })
      const { adjustFontFallback, fallbackFonts } = await loader({
        functionName: 'Inter',
        data: [],
        config: { subsets: [] },
        emitFontFile: jest.fn(),
        resolve: jest.fn(),
        fs: {} as any,
      })
      expect(adjustFontFallback).toEqual({
        ascentOverride: '47.65%',
        descentOverride: '11.88%',
        fallbackFont: 'Arial',
        lineGapOverride: '0.00%',
        sizeAdjust: '203.32%',
      })
      expect(fallbackFonts).toBeUndefined()
    })

    test('Source Code Pro', async () => {
      fetch.mockResolvedValue({
        ok: true,
        text: async () => '',
      })
      const { fallbackFonts, adjustFontFallback } = await loader({
        functionName: 'Source_Code_Pro',
        data: [],
        config: { subsets: [] },
        emitFontFile: jest.fn(),
        resolve: jest.fn(),
        fs: {} as any,
      })
      expect(adjustFontFallback).toEqual({
        ascentOverride: '148.26%',
        descentOverride: '41.13%',
        fallbackFont: 'Arial',
        lineGapOverride: '0.00%',
        sizeAdjust: '66.37%',
      })
      expect(fallbackFonts).toBeUndefined()
    })

    test('Fraunces', async () => {
      fetch.mockResolvedValue({
        ok: true,
        text: async () => '',
      })
      const { adjustFontFallback, fallbackFonts } = await loader({
        functionName: 'Fraunces',
        data: [{ fallback: ['Abc', 'Def'] }],
        config: { subsets: [] },
        emitFontFile: jest.fn(),
        resolve: jest.fn(),
        fs: {} as any,
      })
      expect(adjustFontFallback).toEqual({
        ascentOverride: '63.47%',
        descentOverride: '16.55%',
        fallbackFont: 'Times New Roman',
        lineGapOverride: '0.00%',
        sizeAdjust: '154.08%',
      })
      expect(fallbackFonts).toEqual(['Abc', 'Def'])
    })

    test('adjustFontFallback disabled', async () => {
      fetch.mockResolvedValue({
        ok: true,
        text: async () => '',
      })
      const { css, fallbackFonts } = await loader({
        functionName: 'Inter',
        data: [{ adjustFontFallback: false, fallback: ['system-ui', 'Arial'] }],
        config: { subsets: [] },
        emitFontFile: jest.fn(),
        resolve: jest.fn(),
        fs: {} as any,
      })
      expect(css).toBe('')
      expect(fallbackFonts).toEqual(['system-ui', 'Arial'])
    })
  })

  describe('Errors', () => {
    test('Failed to fetch', async () => {
      fetch.mockResolvedValue({
        ok: false,
      })

      await expect(
        loader({
          functionName: 'Alkalami',
          data: [{ variant: '400' }],
          config: { subsets: [] },
          emitFontFile: jest.fn(),
          resolve: jest.fn(),
          fs: {} as any,
        })
      ).rejects.toThrowErrorMatchingInlineSnapshot(`
              "Failed to fetch font  \`Alkalami\`.
              URL: https://fonts.googleapis.com/css2?family=Alkalami:wght@400&display=optional"
            `)
    })

    test('Missing config with subsets', async () => {
      await expect(
        loader({
          functionName: 'Inter',
          data: [],
          config: undefined,
          emitFontFile: jest.fn(),
          resolve: jest.fn(),
          fs: {} as any,
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
          resolve: jest.fn(),
          fs: {} as any,
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
          resolve: jest.fn(),
          fs: {} as any,
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
          resolve: jest.fn(),
          fs: {} as any,
        })
      ).rejects.toThrowErrorMatchingInlineSnapshot(`
                      "Unknown variant \`123\` for font \`Inter\`.
                      Available variants: \`100\`, \`200\`, \`300\`, \`400\`, \`500\`, \`600\`, \`700\`, \`800\`, \`900\`, \`variable\`"
                  `)
    })

    test('Missing variant for non variable font', async () => {
      await expect(
        loader({
          functionName: 'Abel',
          data: [],
          config: { subsets: [] },
          emitFontFile: jest.fn(),
          resolve: jest.fn(),
          fs: {} as any,
        })
      ).rejects.toThrowErrorMatchingInlineSnapshot(`
              "Missing variant for font \`Abel\`.
              Available variants: \`400\`"
            `)
    })

    test('Invalid display value', async () => {
      await expect(
        loader({
          functionName: 'Inter',
          data: [{ display: 'invalid' }],
          config: { subsets: [] },
          emitFontFile: jest.fn(),
          resolve: jest.fn(),
          fs: {} as any,
        })
      ).rejects.toThrowErrorMatchingInlineSnapshot(`
                      "Invalid display value \`invalid\` for font \`Inter\`.
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
          resolve: jest.fn(),
          fs: {} as any,
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
          resolve: jest.fn(),
          fs: {} as any,
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
          resolve: jest.fn(),
          fs: {} as any,
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
          resolve: jest.fn(),
          fs: {} as any,
        })
      ).rejects.toThrowErrorMatchingInlineSnapshot(`
              "Invalid axes value \`INVALID\` for font \`Roboto Flex\`.
              Available axes: \`GRAD\`, \`XTRA\`, \`YOPQ\`, \`YTAS\`, \`YTDE\`, \`YTFI\`, \`YTLC\`, \`YTUC\`, \`opsz\`, \`slnt\`, \`wdth\`"
            `)
    })
  })
})
