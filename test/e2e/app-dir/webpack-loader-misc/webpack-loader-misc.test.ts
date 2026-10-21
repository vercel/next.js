import { nextTestSetup } from 'e2e-utils'

describe('webpack-loader-misc', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
    dependencies: {
      'schema-utils': 'file:./application-schema-utils',
    },
  })

  it('exposes the server compilation target and mode to loaders', async () => {
    const $ = await next.render$('/')
    expect($('#server-target').text()).toBe('"node"')
    expect($('#mode').text()).toBe(isNextDev ? 'development' : 'production')
  })

  it('exposes the browser compilation target to loaders', async () => {
    const browser = await next.browser('/')
    expect(await browser.elementByCss('#client-target').text()).toBe('"web"')
  })

  describe('getOptions', () => {
    let report: any
    beforeAll(async () => {
      const $ = await next.render$('/get-options')
      report = JSON.parse($('#report').text())
    })

    it('returns the active options object through method, detached, and async calls', () => {
      expect(report.object).toEqual({ value: 'object', count: 2 })
      expect(report.sameObject).toBe(true)
      expect(report.asyncSameObject).toBe(true)
    })

    it('defaults absent options to an empty object', () => {
      expect(report.missing).toEqual({ value: {} })
      expect(report.null).toEqual({ value: {} })
    })

    it('parses JSON object options and rejects malformed JSON', () => {
      expect(report.json).toEqual({ value: { value: 'json', count: 3 } })
      expect(report.malformedJson.error.name).toBe('Error')
      expect(report.malformedJson.error.message).toContain(
        'Cannot parse string options:'
      )
    })

    it.each([
      ['compact', '', ''],
      ['empty', '\n', '  '],
      ['spacedEmpty', '', ''],
      ['spaces', '\n', '  '],
      ['tabs', '\r\n', '\t'],
      ['blankLines', '\n\n', '    '],
    ])(
      'preserves formatting metadata for %s JSON options',
      (name, newline, indent) => {
        expect(report.jsonFormatting[name]).toEqual([
          {
            key: 'newline',
            value: newline,
            enumerable: true,
            writable: true,
            configurable: true,
          },
          {
            key: 'indent',
            value: indent,
            enumerable: true,
            writable: true,
            configurable: true,
          },
        ])
      }
    )

    it('does not add formatting symbols to nested JSON values', () => {
      expect(report.nestedFormatting).toEqual([])
    })

    it('does not add formatting symbols to object or query options', () => {
      expect(report.objectFormatting).toEqual([])
      expect(report.queryFormatting).toEqual([])
    })

    it('parses query options without coercion or a key limit', () => {
      expect(report.emptyString).toEqual({ value: {} })
      expect(report.emptyQueryHasNullPrototype).toBe(true)
      expect(report.query).toEqual({
        value: {
          value: 'query value',
          tag: ['one', 'two'],
          flag: '',
          encoded: '#?',
          unicode: '✓',
          ['__proto__']: 'safe',
        },
      })
      expect(report.manyKeys).toEqual({ count: 1005, last: '1004' })
    })

    it.each([
      ['missingRequired', /options misses the property 'value'/],
      ['wrongType', /options\.count should be an? integer/],
      ['minimum', /options\.count should be >= 1/],
      ['additionalProperty', /options has an unknown property 'extra'/],
    ])('validates %s using the schema title', (key, diagnostic) => {
      expect(report[key].error.name).toBe('ValidationError')
      expect(report[key].error.message).toContain(
        'Fixture Loader has been initialized using an options object'
      )
      expect(report[key].error.message).toMatch(diagnostic)
    })

    it('uses the default diagnostic name for a single-word title', () => {
      expect(report.genericTitle.error.name).toBe('ValidationError')
      expect(report.genericTitle.error.message).toContain(
        'Loader has been initialized using an options object'
      )
    })

    it('uses the schema title data path and resolves schema references', () => {
      expect(report.customDataPath.error.message).toContain(
        "configuration misses the property 'value'"
      )
      expect(report.referencedSchema).toEqual({
        value: { value: 'reference', count: 4 },
      })
    })

    it('does not validate when no schema was supplied', () => {
      expect(report.noSchema).toEqual({ value: { count: 'not validated' } })
      expect(report.scalar).toEqual({ value: false })
      expect(report.array).toEqual({ value: [1, 2] })
    })

    it('uses the framework validator instead of the application version', () => {
      expect(report.applicationValidator).toBe('application')
      expect(report.object.value).toBe('object')
    })
  })
})
