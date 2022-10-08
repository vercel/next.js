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

    test('Default CSS - src array with unicodeRange', async () => {
      const { css } = await loader({
        functionName: '',
        data: [
          { src: [{ file: './my-font.woff2', unicodeRange: 'unicode-range' }] },
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
unicode-range: unicode-range;
}"
`)
    })

    test('Default CSS - src array without unicodeRange', async () => {
      const { css } = await loader({
        functionName: '',
        data: [{ src: [{ file: './my-font.woff2' }] }],
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

    test('Multiple files', async () => {
      const { css } = await loader({
        functionName: '',
        data: [
          {
            src: [
              { file: './my-font1.woff', unicodeRange: '1' },
              { file: './my-font2.woff2', unicodeRange: '2' },
              { file: './my-font3.eot', unicodeRange: '3' },
              { file: './my-font4.ttf', unicodeRange: '4' },
              { file: './my-font5.otf', unicodeRange: '5' },
            ],
          },
        ],
        config: {},
        emitFontFile: () => `/_next/static/media/font-file`,
        resolve: jest.fn(),
        fs: {
          readFile: (_, cb) => cb(null, 'fontdata'),
        },
      })

      expect(css).toMatchInlineSnapshot(`
"@font-face {
font-family: 'my-font1';
src: url(/_next/static/media/font-file) format('woff');
font-display: optional;
unicode-range: 1;
}
@font-face {
font-family: 'my-font1';
src: url(/_next/static/media/font-file) format('woff2');
font-display: optional;
unicode-range: 2;
}
@font-face {
font-family: 'my-font1';
src: url(/_next/static/media/font-file) format('embedded-opentype');
font-display: optional;
unicode-range: 3;
}
@font-face {
font-family: 'my-font1';
src: url(/_next/static/media/font-file) format('truetype');
font-display: optional;
unicode-range: 4;
}
@font-face {
font-family: 'my-font1';
src: url(/_next/static/media/font-file) format('opentype');
font-display: optional;
unicode-range: 5;
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

    test('Empty src array', async () => {
      await expect(
        loader({
          functionName: '',
          data: [{ src: [] }],
          config: {},
          emitFontFile: jest.fn(),
          resolve: jest.fn(),
          fs: {},
        })
      ).rejects.toThrowErrorMatchingInlineSnapshot(
        `"Src must contain one or more files"`
      )
    })

    test('Src array must have one or more elements', async () => {
      await expect(
        loader({
          functionName: '',
          data: [{ src: [] }],
          config: {},
          emitFontFile: jest.fn(),
          resolve: jest.fn(),
          fs: {},
        })
      ).rejects.toThrowErrorMatchingInlineSnapshot(
        `"Src must contain one or more files"`
      )
    })

    test('Src array elements must have file property', async () => {
      await expect(
        loader({
          functionName: '',
          data: [
            {
              src: [
                { file: './my-font1.woff2', unicodeRange: '1' },
                { unicodeRange: '2' },
              ],
            },
          ],

          config: {},
          emitFontFile: jest.fn(),
          resolve: jest.fn(),
          fs: {},
        })
      ).rejects.toThrowErrorMatchingInlineSnapshot(
        `"Src array objects must have a \`file\` property"`
      )
    })

    test("Src array files must have unicodeRange if there's many files", async () => {
      await expect(
        loader({
          functionName: '',
          data: [
            {
              src: [
                { file: './my-font1.woff2', unicodeRange: '1' },
                { file: './my-font2.woff2' },
              ],
            },
          ],

          config: {},
          emitFontFile: jest.fn(),
          resolve: jest.fn(),
          fs: {},
        })
      ).rejects.toThrowErrorMatchingInlineSnapshot(
        `"Files must have a unicode-range if there's more than one"`
      )
    })
  })
})
