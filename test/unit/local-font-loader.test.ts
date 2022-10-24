import loader from '@next/font/local/loader'

describe('@next/font/local', () => {
  describe('generated CSS', () => {
    test('Default CSS', async () => {
      // @ts-expect-error
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
      // @ts-expect-error
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
      // @ts-expect-error
      const { css } = await loader({
        functionName: '',
        data: [
          {
            src: './my-font.woff2',
            declarations: [
              { prop: 'font-feature-settings', value: '"smcp" on' },
              { prop: 'ascent-override', value: '90%' },
            ],
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
        font-feature-settings: \\"smcp\\" on;
        ascent-override: 90%;
        font-family: 'my-font';
        src: url(/_next/static/media/my-font.woff2) format('woff2');
        font-display: optional;
        }"
      `)
    })
  })

  describe('Errors', () => {
    test('Not using default export', async () => {
      await expect(
        // @ts-expect-error
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

    test('Missing src', async () => {
      await expect(
        // @ts-expect-error
        loader({
          functionName: '',
          data: [],
          config: {},
          emitFontFile: jest.fn(),
          resolve: jest.fn(),
          fs: {},
        })
      ).rejects.toThrowErrorMatchingInlineSnapshot(
        `"Missing required \`src\` property"`
      )
    })

    test('Invalid file extension', async () => {
      await expect(
        // @ts-expect-error
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
        // @ts-expect-error
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

    test('Invalid declaration', async () => {
      await expect(
        // @ts-expect-error
        loader({
          functionName: '',
          data: [
            {
              src: './font-file.woff2',
              declarations: [{ prop: 'src', value: '/hello.woff2' }],
            },
          ],

          config: {},
          emitFontFile: jest.fn(),
          resolve: jest.fn(),
          fs: {},
        })
      ).rejects.toThrowErrorMatchingInlineSnapshot(
        `"Invalid declaration prop: \`src\`"`
      )
    })
  })
})
