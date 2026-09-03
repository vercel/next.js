import { getModuleCode } from './utils'

describe('css-loader getModuleCode', () => {
  it('emits valid JS options for url() replacements needing quotes (image-set string args)', () => {
    // `image-set("a.png" 1x)` produces a replacement item with
    // `needQuotes: true` and no localName. The emitted getUrl options must be
    // a single `needQuotes: true` entry — spreading the string would emit one
    // entry per character and produce unparsable module code.
    const code = getModuleCode(
      { map: null, css: 'body { background: image-set("a.png" 1x) }' },
      [],
      [
        {
          replacementName: '___CSS_LOADER_URL_REPLACEMENT_0___',
          importName: '___CSS_LOADER_URL_IMPORT_0___',
          localName: undefined,
          hash: undefined,
          needQuotes: true,
        },
      ],
      {
        modules: { exportOnlyLocals: false, namedExport: true },
        sourceMap: false,
      },
      {}
    )

    expect(code).toContain(
      '___CSS_LOADER_GET_URL_IMPORT___(___CSS_LOADER_URL_IMPORT_0___, { needQuotes: true })'
    )

    // The emitted module code must be syntactically valid JavaScript.
    expect(() => {
      // eslint-disable-next-line no-new-func -- used as a syntax-only parse check
      new Function('module', code)
    }).not.toThrow()
  })

  it('emits hash and needQuotes together as valid options', () => {
    const code = getModuleCode(
      { map: null, css: '.a { content: url(a.png) }' },
      [],
      [
        {
          replacementName: '___CSS_LOADER_URL_REPLACEMENT_0___',
          importName: '___CSS_LOADER_URL_IMPORT_0___',
          localName: undefined,
          hash: 'abc123',
          needQuotes: true,
        },
      ],
      {
        modules: { exportOnlyLocals: false, namedExport: true },
        sourceMap: false,
      },
      {}
    )

    expect(code).toContain(
      '{ hash: "abc123", needQuotes: true }'
    )
    expect(() => {
      // eslint-disable-next-line no-new-func -- used as a syntax-only parse check
      new Function('module', code)
    }).not.toThrow()
  })
})
