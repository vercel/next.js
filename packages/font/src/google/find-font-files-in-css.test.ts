import { findFontFilesInCss } from './find-font-files-in-css'

describe('findFontFilesInCss', () => {
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
      { googleFontFileUrl: 'latin1.woff2', preloadFontFile: true },
      { googleFontFileUrl: 'greek1.woff2', preloadFontFile: false },
      { googleFontFileUrl: 'latin2.woff2', preloadFontFile: true },
      { googleFontFileUrl: 'greek2.woff2', preloadFontFile: false },
      { googleFontFileUrl: 'cyrilic.woff2', preloadFontFile: true },
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
      },
    ])
  })
})
