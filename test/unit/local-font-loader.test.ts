import loader from '@next/font/local/loader'

describe('@next/font/local', () => {
  describe('generated CSS', () => {
    test('Default CSS', async () => {
      const { css } = await loader({
        functionName: '',
        data: [{ src: './my-font.woff2' }],
        config: {},
        emitFontFile: () => '/_next/static/media/my-font.woff2',
        resolve: jest.fn(),
        fs: {
          readFile: (_, cb) => cb(null, 'fontdata'),
        },
      })

      expect(css).toMatchInlineSnapshot(`
"@font-face {
font-family: 'my-font';
src: url(/_next/static/media/my-font.woff2) format('woff2');
font-display: optional;
}"
`)
    })

    test('Weight and style', async () => {
      const { css } = await loader({
        functionName: '',
        data: [{ src: './my-font.woff2', weight: '100 900', style: 'italic' }],
        config: {},
        emitFontFile: () => '/_next/static/media/my-font.woff2',
        resolve: jest.fn(),
        fs: {
          readFile: (_, cb) => cb(null, 'fontdata'),
        },
      })

      expect(css).toMatchInlineSnapshot(`
"@font-face {
font-family: 'my-font';
src: url(/_next/static/media/my-font.woff2) format('woff2');
font-display: optional;
font-weight: 100 900;
font-style: italic;
}"
`)
    })

    test('Other properties', async () => {
      const { css } = await loader({
        functionName: '',
        data: [
          {
            src: './my-font.woff2',
            weight: '100 900',
            style: 'italic',
            ascentOverride: 'ascentOverride',
            descentOverride: 'descentOverride',
            lineGapOverride: 'lineGapOverride',
            fontStretch: 'fontStretch',
            fontFeatureSettings: 'fontFeatureSettings',
            sizeAdjust: 'sizeAdjust',
          },
        ],
        config: {},
        emitFontFile: () => '/_next/static/media/my-font.woff2',
        resolve: jest.fn(),
        fs: {
          readFile: (_, cb) => cb(null, 'fontdata'),
        },
      })

      expect(css).toMatchInlineSnapshot(`
"@font-face {
font-family: 'my-font';
src: url(/_next/static/media/my-font.woff2) format('woff2');
font-display: optional;
font-weight: 100 900;
font-style: italic;
ascent-override: ascentOverride;
descent-override: descentOverride;
line-gap-override: lineGapOverride;
font-stretch: fontStretch;
font-feature-settings: fontFeatureSettings;
size-adjust: sizeAdjust;
}"
`)
    })
  })

  describe('Errors', () => {
    test('Not using default export', async () => {
      await expect(
        loader({
          functionName: 'Named',
          data: [],
          config: {},
          emitFontFile: jest.fn(),
          resolve: jest.fn(),
          fs: {},
        })
      ).rejects.toThrowErrorMatchingInlineSnapshot(
        `"@next/font/local has no named exports"`
      )
    })

    test('Invalid file extension', async () => {
      await expect(
        loader({
          functionName: '',
          data: [{ src: './font/font-file.abc' }],
          config: {},
          emitFontFile: jest.fn(),
          resolve: jest.fn().mockResolvedValue(''),
          fs: {},
        })
      ).rejects.toThrowErrorMatchingInlineSnapshot(
        `"Unexpected file \`./font/font-file.abc\`"`
      )
    })

    test('Invalid display value', async () => {
      await expect(
        loader({
          functionName: '',
          data: [{ src: './font-file.woff2', display: 'invalid' }],
          config: {},
          emitFontFile: jest.fn(),
          resolve: jest.fn(),
          fs: {},
        })
      ).rejects.toThrowErrorMatchingInlineSnapshot(`
              "Invalid display value \`invalid\`.
              Available display values: \`auto\`, \`block\`, \`swap\`, \`fallback\`, \`optional\`"
            `)
    })
  })
})
