import loader from '@next/font/local/loader'

describe('next/font/local', () => {
  describe('generated CSS', () => {
    test('Default CSS', async () => {
      const { css } = await loader({
        functionName: '',
        data: [{ src: './my-font.woff2' }],
        config: {},
        emitFontFile: () => '/_next/static/media/my-font.woff2',
        resolve: jest.fn(),
        isDev: false,
        isServer: true,
        variableName: 'myFont',
        loaderContext: {
          fs: {
            readFile: (_, cb) => cb(null, 'fontdata'),
          },
        } as any,
      })

      expect(css).toMatchInlineSnapshot(`
        "@font-face {
        font-family: myFont;
        src: url(/_next/static/media/my-font.woff2) format('woff2');
        font-display: swap;
        }
        "
      `)
    })

    test('Weight and style', async () => {
      const { css } = await loader({
        functionName: '',
        data: [{ src: './my-font.woff2', weight: '100 900', style: 'italic' }],
        config: {},
        emitFontFile: () => '/_next/static/media/my-font.woff2',
        resolve: jest.fn(),
        isDev: false,
        isServer: true,
        variableName: 'myFont',
        loaderContext: {
          fs: {
            readFile: (_, cb) => cb(null, 'fontdata'),
          },
        } as any,
      })

      expect(css).toMatchInlineSnapshot(`
        "@font-face {
        font-family: myFont;
        src: url(/_next/static/media/my-font.woff2) format('woff2');
        font-display: swap;
        font-weight: 100 900;
        font-style: italic;
        }
        "
      `)
    })

    test('Other properties', async () => {
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
        isDev: false,
        isServer: true,
        variableName: 'myFont',
        loaderContext: {
          fs: {
            readFile: (_, cb) => cb(null, 'fontdata'),
          },
        } as any,
      })

      expect(css).toMatchInlineSnapshot(`
        "@font-face {
        font-feature-settings: \\"smcp\\" on;
        ascent-override: 90%;
        font-family: myFont;
        src: url(/_next/static/media/my-font.woff2) format('woff2');
        font-display: swap;
        }
        "
      `)
    })

    test('Multiple weights default style', async () => {
      const { css } = await loader({
        functionName: '',
        data: [
          {
            style: 'italic',
            src: [
              {
                path: './fonts/font1.woff2',
                weight: '100',
              },
              {
                path: './fonts/font2.woff2',
                weight: '400',
              },
              {
                path: './fonts/font3.woff2',
                weight: '700',
              },
              {
                path: './fonts/font2.woff2',
                weight: '400',
                style: 'normal',
              },
            ],
            adjustFontFallback: false,
          },
        ],
        config: {},
        emitFontFile: (buffer) => `/_next/static/media/my-font.woff2`,
        resolve: jest.fn(),
        isDev: false,
        isServer: true,
        variableName: 'myFont',
        loaderContext: {
          fs: {
            readFile: (path, cb) => cb(null, path),
          },
        } as any,
      })

      expect(css).toMatchInlineSnapshot(`
        "@font-face {
        font-family: myFont;
        src: url(/_next/static/media/my-font.woff2) format('woff2');
        font-display: swap;
        font-weight: 100;
        font-style: italic;
        }

        @font-face {
        font-family: myFont;
        src: url(/_next/static/media/my-font.woff2) format('woff2');
        font-display: swap;
        font-weight: 400;
        font-style: italic;
        }

        @font-face {
        font-family: myFont;
        src: url(/_next/static/media/my-font.woff2) format('woff2');
        font-display: swap;
        font-weight: 700;
        font-style: italic;
        }

        @font-face {
        font-family: myFont;
        src: url(/_next/static/media/my-font.woff2) format('woff2');
        font-display: swap;
        font-weight: 400;
        font-style: normal;
        }
        "
      `)
    })

    test('Multiple styles default weight', async () => {
      const { css } = await loader({
        functionName: '',
        data: [
          {
            weight: '400',
            src: [
              {
                path: './fonts/font1.woff2',
                style: 'normal',
              },
              {
                path: './fonts/font3.woff2',
                style: 'italic',
              },
              {
                path: './fonts/font2.woff2',
                weight: '700',
              },
            ],
            adjustFontFallback: false,
          },
        ],
        config: {},
        emitFontFile: (buffer) => `/_next/static/media/my-font.woff2`,
        resolve: jest.fn(),
        isDev: false,
        isServer: true,
        variableName: 'myFont',
        loaderContext: {
          fs: {
            readFile: (path, cb) => cb(null, path),
          },
        } as any,
      })

      expect(css).toMatchInlineSnapshot(`
        "@font-face {
        font-family: myFont;
        src: url(/_next/static/media/my-font.woff2) format('woff2');
        font-display: swap;
        font-weight: 400;
        font-style: normal;
        }

        @font-face {
        font-family: myFont;
        src: url(/_next/static/media/my-font.woff2) format('woff2');
        font-display: swap;
        font-weight: 400;
        font-style: italic;
        }

        @font-face {
        font-family: myFont;
        src: url(/_next/static/media/my-font.woff2) format('woff2');
        font-display: swap;
        font-weight: 700;
        }
        "
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
          isDev: false,
          isServer: true,
          variableName: 'myFont',
          loaderContext: {} as any,
        })
      ).rejects.toThrowErrorMatchingInlineSnapshot(
        `"next/font/local has no named exports"`
      )
    })

    test('Missing src', async () => {
      await expect(
        loader({
          functionName: '',
          data: [],
          config: {},
          emitFontFile: jest.fn(),
          resolve: jest.fn(),
          isDev: false,
          isServer: true,
          variableName: 'myFont',
          loaderContext: {} as any,
        })
      ).rejects.toThrowErrorMatchingInlineSnapshot(
        `"Missing required \`src\` property"`
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
          isDev: false,
          isServer: true,
          variableName: 'myFont',
          loaderContext: {} as any,
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
          isDev: false,
          isServer: true,
          variableName: 'myFont',
          loaderContext: {} as any,
        })
      ).rejects.toThrowErrorMatchingInlineSnapshot(`
              "Invalid display value \`invalid\`.
              Available display values: \`auto\`, \`block\`, \`swap\`, \`fallback\`, \`optional\`"
            `)
    })

    test('Invalid declaration', async () => {
      await expect(
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
          isDev: false,
          isServer: true,
          variableName: 'myFont',
          loaderContext: {} as any,
        })
      ).rejects.toThrowErrorMatchingInlineSnapshot(
        `"Invalid declaration prop: \`src\`"`
      )
    })

    test('Empty src array', async () => {
      await expect(
        loader({
          functionName: '',
          data: [{ src: [] }],
          config: {},
          emitFontFile: jest.fn(),
          resolve: jest.fn(),
          isDev: false,
          isServer: true,
          variableName: 'myFont',
          loaderContext: {} as any,
        })
      ).rejects.toThrowErrorMatchingInlineSnapshot(
        `"Unexpected empty \`src\` array."`
      )
    })

    test('Invalid weight in array', async () => {
      await expect(
        loader({
          functionName: '',
          data: [
            {
              src: [
                { path: './font1.woff2', weight: 'normal' },
                { path: './font2.woff2', weight: 'normal' },
                { path: './font3.woff2', weight: '400' },
                { path: './font3.woff2', weight: 'abc' },
              ],
            },
          ],

          config: {},
          emitFontFile: jest.fn(),
          resolve: jest.fn(),
          isDev: false,
          isServer: true,
          variableName: 'myFont',
          loaderContext: {
            fs: { readFile: (path, cb) => cb(null, path) },
          } as any,
        } as any)
      ).rejects.toThrowErrorMatchingInlineSnapshot(`
              "Invalid weight value in src array: \`abc\`.
              Expected \`normal\`, \`bold\` or a number."
            `)
    })

    test('Invalid variable weight in array', async () => {
      await expect(
        loader({
          functionName: '',
          data: [
            {
              src: [
                { path: './font1.woff2', weight: 'normal bold' },
                { path: './font2.woff2', weight: '400 bold' },
                { path: './font3.woff2', weight: 'normal 700' },
                { path: './font4.woff2', weight: '100 abc' },
              ],
            },
          ],

          config: {},
          emitFontFile: jest.fn(),
          resolve: jest.fn(),
          isDev: false,
          isServer: true,
          variableName: 'myFont',
          loaderContext: {
            fs: { readFile: (path, cb) => cb(null, path) },
          } as any,
        })
      ).rejects.toThrowErrorMatchingInlineSnapshot(`
              "Invalid weight value in src array: \`100 abc\`.
              Expected \`normal\`, \`bold\` or a number."
            `)
    })
  })
})
