import { findFontFilesInCss } from './find-font-files-in-css'

describe('findFontFilesInCss', () => {
  it.each([
    [
      'https://fonts.gstatic.com/l/font?kit=a=b&skey=c&v=v20',
      "format('woff2')",
      'woff2',
    ],
    [
      'https://fonts.gstatic.com/l/font?kit=a%2Bb&skey=c',
      'format("woff")',
      'woff',
    ],
    ['https://fonts.gstatic.com/l/font', "format('truetype')", 'ttf'],
    ['https://fonts.gstatic.com/l/font', "format('opentype')", 'otf'],
    ['https://fonts.gstatic.com/l/font', "format('embedded-opentype')", 'eot'],
    ['https://fonts.gstatic.com/l/font', '', 'woff2'],
    ['https://fonts.gstatic.com/l/font', "format('unknown')", 'woff2'],
    [
      'https://fonts.gstatic.com/s/font.ttf?kit=a&v=1#font',
      "format('woff2')",
      'ttf',
    ],
    ['https://fonts.gstatic.com/l/font?kit=a.woff', "format('woff2')", 'woff2'],
  ])('resolves the extension of %s %s as %s', (url, format, ext) => {
    const css = `/* latin */
@font-face {
  src: url(${url}) ${format};
}
@font-face {
  src: url(${url}) ${format};
}`
    expect(findFontFilesInCss(css, ['latin'])).toEqual([
      { googleFontFileUrl: url, preloadFontFile: true, ext },
    ])
  })

  it('should find all font files and preload requested subsets', () => {
    const css = `/* latin */
            @font-face {
              font-family: 'Fraunces';
              font-style: normal;
              font-weight: 300;
              src: url(latin1.woff2) format('woff2');
            }

            /* greek */
            @font-face {
              font-family: 'Fraunces';
              font-style: normal;
              font-weight: 300;
              src: url(greek1.woff2) format('woff2');
            }

            /* latin */
            @font-face {
              font-family: 'Fraunces';
              font-style: normal;
              font-weight: 400;
              src: url(latin2.woff2) format('woff2');
            }

            /* greek */
            @font-face {
              font-family: 'Fraunces';
              font-style: normal;
              font-weight: 400;
              src: url(greek2.woff2) format('woff2');
            }

            /* cyrilic */
            @font-face {
              font-family: 'Fraunces';
              font-style: normal;
              font-weight: 400;
              src: url(cyrilic.woff2) format('woff2');
            }
                  `

    expect(findFontFilesInCss(css, ['latin', 'cyrilic'])).toEqual([
      {
        googleFontFileUrl: 'latin1.woff2',
        preloadFontFile: true,
        ext: 'woff2',
      },
      {
        googleFontFileUrl: 'greek1.woff2',
        preloadFontFile: false,
        ext: 'woff2',
      },
      {
        googleFontFileUrl: 'latin2.woff2',
        preloadFontFile: true,
        ext: 'woff2',
      },
      {
        googleFontFileUrl: 'greek2.woff2',
        preloadFontFile: false,
        ext: 'woff2',
      },
      {
        googleFontFileUrl: 'cyrilic.woff2',
        preloadFontFile: true,
        ext: 'woff2',
      },
    ])
  })

  it('should not return duplicate font files when several variants use the same font file', () => {
    const css = `/* latin */
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
              `

    expect(findFontFilesInCss(css)).toEqual([
      {
        googleFontFileUrl:
          'https://fonts.gstatic.com/s/fraunces/v24/6NUu8FyLNQOQZAnv9bYEvDiIdE9Ea92uemAk_WBq8U_9v0c2Wa0K7iN7hzFUPJH58nib14c7qv8oRcTn.woff2',
        preloadFontFile: false,
        ext: 'woff2',
      },
    ])
  })
})
