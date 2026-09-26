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
      { googleFontFileUrl: 'latin1.woff2', preloadFontFile: true, format: 'woff2' },
      { googleFontFileUrl: 'greek1.woff2', preloadFontFile: false, format: 'woff2' },
      { googleFontFileUrl: 'latin2.woff2', preloadFontFile: true, format: 'woff2' },
      { googleFontFileUrl: 'greek2.woff2', preloadFontFile: false, format: 'woff2' },
      { googleFontFileUrl: 'cyrilic.woff2', preloadFontFile: true, format: 'woff2' },
    ])
  })

  it('should return the format hint for extensionless font file URLs', () => {
    const css = `/* latin */
        @font-face {
          font-family: 'Inter';
          font-style: normal;
          font-weight: 400;
          font-display: swap;
          src: url(https://fonts.gstatic.com/l/font?kit=UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfAZ9hiA&skey=c491285d6722e4fa&v=v20) format('woff2');
          unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+2074, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
        }
        /* latin */
        @font-face {
          font-family: 'Inter';
          font-style: normal;
          font-weight: 400;
          font-display: swap;
          src: url(https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyaW1.woff2) format("woff2");
        }
              `

    expect(findFontFilesInCss(css, ['latin'])).toEqual([
      {
        googleFontFileUrl:
          'https://fonts.gstatic.com/l/font?kit=UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfAZ9hiA&skey=c491285d6722e4fa&v=v20',
        preloadFontFile: true,
        format: 'woff2',
      },
      {
        googleFontFileUrl:
          'https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyaW1.woff2',
        preloadFontFile: true,
        format: 'woff2',
      },
    ])
  })

  it('should return an undefined format when the src line has no format hint', () => {
    const css = `/* latin */
        @font-face {
          font-family: 'Inter';
          font-style: normal;
          font-weight: 400;
          src: url(https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyaW1);
        }
              `

    expect(findFontFilesInCss(css)).toEqual([
      {
        googleFontFileUrl:
          'https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyaW1',
        preloadFontFile: false,
        format: undefined,
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
        format: 'woff2',
      },
    ])
  })
})
