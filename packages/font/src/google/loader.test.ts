import nextFontGoogleFontLoader from './loader'
import { fetchResource } from './fetch-resource'

jest.mock('./fetch-resource')

const mockFetchResource = fetchResource as jest.Mock

describe('next/font/google loader', () => {
  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('URL from options', () => {
    const fixtures: Array<[string, any, string]> = [
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
        'Source_Sans_3',
        { weight: '900', display: 'auto' },
        'https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@900&display=auto',
      ],
      [
        'Source_Sans_3',
        { weight: '200', style: 'italic' },
        'https://fonts.googleapis.com/css2?family=Source+Sans+3:ital,wght@1,200&display=swap',
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
    ]
    test.each(fixtures)(
      '%s',
      async (
        functionName: string,
        fontFunctionArguments: any,
        expectedUrl: any
      ) => {
        mockFetchResource.mockResolvedValue(Buffer.from('OK'))
        const { css } = await nextFontGoogleFontLoader({
          functionName,
          data: [
            {
              adjustFontFallback: false,
              subsets: [],
              ...fontFunctionArguments,
            },
          ],
          emitFontFile: jest.fn(),
          resolve: jest.fn(),
          loaderContext: {} as any,
          isDev: false,
          isServer: true,
          variableName: 'myFont',
        })
        expect(css).toBe('OK')
        expect(mockFetchResource).toHaveBeenCalledTimes(1)
        expect(mockFetchResource).toHaveBeenCalledWith(
          expectedUrl,
          false,
          expect.stringContaining('Failed to fetch font')
        )
      }
    )
  })

  describe('extensionless font file URLs', () => {
    const extensionlessCss = `/* latin */
@font-face {
  font-family: 'Inter';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url(https://fonts.gstatic.com/l/font?kit=UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfAZ9hiA&skey=c491285d6722e4fa&v=v20) format('woff2');
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+2074, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
}
`

    async function runLoaderWithCss(css: string) {
      mockFetchResource.mockImplementation((url: string) =>
        Promise.resolve(
          url.includes('css2')
            ? Buffer.from(css)
            : Buffer.from('fake font file contents')
        )
      )
      const emitFontFile = jest
        .fn()
        .mockReturnValue('/_next/static/media/inter-latin.woff2')
      const result = await nextFontGoogleFontLoader({
        functionName: 'Roboto',
        data: [
          {
            adjustFontFallback: false,
            subsets: ['latin'],
            weight: '400',
          },
        ],
        emitFontFile,
        resolve: jest.fn(),
        loaderContext: {} as any,
        isDev: false,
        isServer: true,
        variableName: 'myFont',
      })
      return { result, emitFontFile }
    }

    it('does not crash and emits the font as woff2', async () => {
      const { result, emitFontFile } = await runLoaderWithCss(extensionlessCss)

      expect(emitFontFile).toHaveBeenCalledTimes(1)
      expect(emitFontFile).toHaveBeenCalledWith(
        expect.any(Buffer),
        'woff2',
        expect.any(Boolean),
        expect.any(Boolean)
      )
      expect(result.css).toContain('/_next/static/media/inter-latin.woff2')
      expect(result.css).not.toContain('fonts.gstatic.com/l/font')
    })

    it('keeps using the URL extension when one is present', async () => {
      const cssWithExtension = extensionlessCss.replace(
        'https://fonts.gstatic.com/l/font?kit=UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfAZ9hiA&skey=c491285d6722e4fa&v=v20',
        'https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyaW1.woff2'
      )
      const { emitFontFile } = await runLoaderWithCss(cssWithExtension)

      expect(emitFontFile).toHaveBeenCalledTimes(1)
      expect(emitFontFile).toHaveBeenCalledWith(
        expect.any(Buffer),
        'woff2',
        expect.any(Boolean),
        expect.any(Boolean)
      )
    })
  })
})
