import loader from '@next/font/google/loader'
import fetch from 'next/dist/compiled/node-fetch'

jest.mock('next/dist/compiled/node-fetch')

describe('next/font/google loader', () => {
  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('URL from options', () => {
    test.each([
      [
        'Inter',
        {},
        'https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap',
      ],
      [
        'Inter',
        { weight: '400' },
        'https://fonts.googleapis.com/css2?family=Inter:wght@400&display=swap',
      ],
      [
        'Inter',
        { weight: '900', display: 'block' },
        'https://fonts.googleapis.com/css2?family=Inter:wght@900&display=block',
      ],
      [
        'Source_Sans_Pro',
        { weight: '900', display: 'auto' },
        'https://fonts.googleapis.com/css2?family=Source+Sans+Pro:wght@900&display=auto',
      ],
      [
        'Source_Sans_Pro',
        { weight: '200', style: 'italic' },
        'https://fonts.googleapis.com/css2?family=Source+Sans+Pro:ital,wght@1,200&display=swap',
      ],
      [
        'Roboto_Flex',
        { display: 'swap' },
        'https://fonts.googleapis.com/css2?family=Roboto+Flex:wght@100..1000&display=swap',
      ],
      [
        'Roboto_Flex',
        { display: 'fallback', weight: 'variable', axes: ['opsz'] },
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
        { weight: '400' },
        'https://fonts.googleapis.com/css2?family=Oooh+Baby:wght@400&display=swap',
      ],
      [
        'Albert_Sans',
        { weight: 'variable', style: 'italic' },
        'https://fonts.googleapis.com/css2?family=Albert+Sans:ital,wght@1,100..900&display=swap',
      ],
      [
        'Fraunces',
        { weight: 'variable', style: 'italic', axes: ['WONK', 'opsz', 'SOFT'] },
        'https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght,SOFT,WONK@1,9..144,100..900,0..100,0..1&display=swap',
      ],
      [
        'Molle',
        { weight: '400' },
        'https://fonts.googleapis.com/css2?family=Molle:ital,wght@1,400&display=swap',
      ],
      [
        'Roboto',
        { weight: ['500', '300', '400'], style: ['normal', 'italic'] },
        'https://fonts.googleapis.com/css2?family=Roboto:ital,wght@0,300;0,400;0,500;1,300;1,400;1,500&display=swap',
      ],
      [
        'Roboto Mono',
        { style: ['italic', 'normal'] },
        'https://fonts.googleapis.com/css2?family=Roboto+Mono:ital,wght@0,100..700;1,100..700&display=swap',
      ],
      [
        'Fraunces',
        {
          style: ['normal', 'italic'],
          axes: ['WONK', 'opsz', 'SOFT'],
        },
        'https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght,SOFT,WONK@0,9..144,100..900,0..100,0..1;1,9..144,100..900,0..100,0..1&display=swap',
      ],
      [
        'Poppins',
        { weight: ['900', '400', '100'] },
        'https://fonts.googleapis.com/css2?family=Poppins:wght@100;400;900&display=swap',
      ],
      [
        'Nabla',
        {},
        'https://fonts.googleapis.com/css2?family=Nabla&display=swap',
      ],
      [
        'Nabla',
        { axes: ['EDPT', 'EHLT'] },
        'https://fonts.googleapis.com/css2?family=Nabla:EDPT,EHLT@0..200,0..24&display=swap',
      ],
      [
        'Ballet',
        {},
        'https://fonts.googleapis.com/css2?family=Ballet&display=swap',
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
        loaderContext: {} as any,
        isDev: false,
        isServer: true,
        variableName: 'myFont',
      })
      expect(css).toBe('OK')
      expect(fetch).toHaveBeenCalledTimes(1)
      expect(fetch).toHaveBeenCalledWith(url, expect.any(Object))
    })
  })

  describe('Errors', () => {
    test('Missing function name', async () => {
      await expect(
        loader({
          functionName: '', // default import
          data: [],
          config: { subsets: [] },
          emitFontFile: jest.fn(),
          resolve: jest.fn(),
          loaderContext: {} as any,
          isDev: false,
          isServer: true,
          variableName: 'myFont',
        })
      ).rejects.toThrowErrorMatchingInlineSnapshot(
        `"next/font/google has no default export"`
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
          loaderContext: {} as any,
          isDev: false,
          isServer: true,
          variableName: 'myFont',
        })
      ).rejects.toThrowErrorMatchingInlineSnapshot(
        `"Unknown font \`Unknown Font\`"`
      )
    })

    test('Unknown weight', async () => {
      await expect(
        loader({
          functionName: 'Inter',
          data: [{ weight: '123' }],
          config: { subsets: [] },
          emitFontFile: jest.fn(),
          resolve: jest.fn(),
          loaderContext: {} as any,
          isDev: false,
          isServer: true,
          variableName: 'myFont',
        })
      ).rejects.toThrowErrorMatchingInlineSnapshot(`
              "Unknown weight \`123\` for font \`Inter\`.
              Available weights: \`100\`, \`200\`, \`300\`, \`400\`, \`500\`, \`600\`, \`700\`, \`800\`, \`900\`, \`variable\`"
            `)
    })

    test('Missing weight for non variable font', async () => {
      await expect(
        loader({
          functionName: 'Abel',
          data: [],
          config: { subsets: [] },
          emitFontFile: jest.fn(),
          resolve: jest.fn(),
          loaderContext: {} as any,
          isDev: false,
          isServer: true,
          variableName: 'myFont',
        })
      ).rejects.toThrowErrorMatchingInlineSnapshot(`
              "Missing weight for font \`Abel\`.
              Available weights: \`400\`"
            `)
    })

    test('Unknown style', async () => {
      await expect(
        loader({
          functionName: 'Molle',
          data: [{ weight: '400', style: 'normal' }],
          config: { subsets: [] },
          emitFontFile: jest.fn(),
          resolve: jest.fn(),
          loaderContext: {} as any,
          isDev: false,
          isServer: true,
          variableName: 'myFont',
        })
      ).rejects.toThrowErrorMatchingInlineSnapshot(`
              "Unknown style \`normal\` for font \`Molle\`.
              Available styles: \`italic\`"
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
          loaderContext: {} as any,
          isDev: false,
          isServer: true,
          variableName: 'myFont',
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
          data: [{ weight: '400', axes: [] }],
          config: { subsets: [] },
          emitFontFile: jest.fn(),
          resolve: jest.fn(),
          loaderContext: {} as any,
          isDev: false,
          isServer: true,
          variableName: 'myFont',
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
          loaderContext: {} as any,
          isDev: false,
          isServer: true,
          variableName: 'myFont',
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
          loaderContext: {} as any,
          isDev: false,
          isServer: true,
          variableName: 'myFont',
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
          loaderContext: {} as any,
          isDev: false,
          isServer: true,
          variableName: 'myFont',
        })
      ).rejects.toThrowErrorMatchingInlineSnapshot(`
              "Invalid axes value \`INVALID\` for font \`Roboto Flex\`.
              Available axes: \`GRAD\`, \`XTRA\`, \`YOPQ\`, \`YTAS\`, \`YTDE\`, \`YTFI\`, \`YTLC\`, \`YTUC\`, \`opsz\`, \`slnt\`, \`wdth\`"
            `)
    })

    test('Variable in weight array', async () => {
      await expect(
        loader({
          functionName: 'Inter',
          data: [{ weight: ['100', 'variable'] }],
          config: { subsets: [] },
          emitFontFile: jest.fn(),
          resolve: jest.fn(),
          loaderContext: {} as any,
          isDev: false,
          isServer: true,
          variableName: 'myFont',
        })
      ).rejects.toThrowErrorMatchingInlineSnapshot(
        `"Unexpected \`variable\` in weight array for font \`Inter\`. You only need \`variable\`, it includes all available weights."`
      )
    })

    test('Invalid subset in call', async () => {
      await expect(
        loader({
          functionName: 'Inter',
          data: [{ weight: ['100', 'variable'], subsets: ['latin', 'oops'] }],
          config: { subsets: ['ignored'] },
          emitFontFile: jest.fn(),
          resolve: jest.fn(),
          loaderContext: {} as any,
          isDev: false,
          isServer: true,
          variableName: 'myFont',
        })
      ).rejects.toThrowErrorMatchingInlineSnapshot(`
              "Unknown subset \`oops\` for font \`Inter\`.
              Available subsets: \`cyrillic\`, \`cyrillic-ext\`, \`greek\`, \`greek-ext\`, \`latin\`, \`latin-ext\`, \`vietnamese\`"
            `)
    })

    test('Invalid subset in config', async () => {
      await expect(
        loader({
          functionName: 'Inter',
          data: [{ weight: ['100', 'variable'] }],
          config: { subsets: ['whoops'] },
          emitFontFile: jest.fn(),
          resolve: jest.fn(),
          loaderContext: {} as any,
          isDev: false,
          isServer: true,
          variableName: 'myFont',
        })
      ).rejects.toThrowErrorMatchingInlineSnapshot(`
              "Unknown subset \`whoops\` for font \`Inter\`.
              Available subsets: \`cyrillic\`, \`cyrillic-ext\`, \`greek\`, \`greek-ext\`, \`latin\`, \`latin-ext\`, \`vietnamese\`"
            `)
    })

    test('Missing subsets in config and call', async () => {
      await expect(
        loader({
          functionName: 'Inter',
          data: [{ weight: ['100', 'variable'] }],
          config: {},
          emitFontFile: jest.fn(),
          resolve: jest.fn(),
          loaderContext: {} as any,
          isDev: false,
          isServer: true,
          variableName: 'myFont',
        })
      ).rejects.toThrowErrorMatchingInlineSnapshot(
        `"Missing selected subsets for font \`Inter\`. Please specify subsets in the function call or in your \`next.config.js\`. Read more: https://nextjs.org/docs/messages/google-fonts-missing-subsets"`
      )
    })
  })

  it('should not send duplicate requests when several font variants use the same font file', async () => {
    fetch
      .mockResolvedValue({
        ok: true,
        arrayBuffer: () => '',
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => `
/* latin */
@font-face {
  font-family: 'Fraunces';
  font-style: normal;
  font-weight: 100;
  font-display: swap;
  src: url(https://fonts.gstatic.com/s/fraunces/v24/6NUu8FyLNQOQZAnv9bYEvDiIdE9Ea92uemAk_WBq8U_9v0c2Wa0K7iN7hzFUPJH58nib14c7qv8oRcTn.woff2) format('woff2');
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+2074, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
}
/* latin */
@font-face {
  font-family: 'Fraunces';
  font-style: normal;
  font-weight: 300;
  font-display: swap;
  src: url(https://fonts.gstatic.com/s/fraunces/v24/6NUu8FyLNQOQZAnv9bYEvDiIdE9Ea92uemAk_WBq8U_9v0c2Wa0K7iN7hzFUPJH58nib14c7qv8oRcTn.woff2) format('woff2');
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+2074, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
}
/* latin */
@font-face {
  font-family: 'Fraunces';
  font-style: normal;
  font-weight: 900;
  font-display: swap;
  src: url(https://fonts.gstatic.com/s/fraunces/v24/6NUu8FyLNQOQZAnv9bYEvDiIdE9Ea92uemAk_WBq8U_9v0c2Wa0K7iN7hzFUPJH58nib14c7qv8oRcTn.woff2) format('woff2');
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+2074, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
}
      `,
      })
    const { css } = await loader({
      functionName: 'Fraunces',
      data: [{ weight: ['100', '300', '900'] }],
      config: { subsets: [] },
      emitFontFile: jest.fn(),
      resolve: jest.fn(),
      loaderContext: {} as any,
      isDev: false,
      isServer: true,
      variableName: 'myFont',
    })
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(css).not.toInclude('https://fonts.gstatic.com/s/fraunces/v24/')
  })
})
