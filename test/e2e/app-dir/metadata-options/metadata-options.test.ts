import { nextTestSetup } from 'e2e-utils'
import {
  cases,
  completeViewportExpected,
  getCase,
  type Expected,
} from './cases'

describe('metadata-options', () => {
  const { next } = nextTestSetup({ files: __dirname })
  type Rendered = Awaited<ReturnType<typeof next.render$>>

  function assertMetadata($: Rendered, expected: Expected) {
    expect($('meta[charset]').attr('charset')).toBe('utf-8')
    if (expected.title !== undefined)
      expect($('title').text()).toBe(expected.title)

    const names = {
      viewport: 'width=device-width, initial-scale=1',
      ...expected.names,
    }
    for (const [attribute, values] of [
      ['name', names],
      ['property', expected.properties || {}],
    ] as const) {
      for (const [key, value] of Object.entries(values)) {
        const actual = $(`meta[${attribute}="${key}"]`)
          .map((_, tag) => $(tag).attr('content'))
          .get()
        expect({ [key]: actual }).toEqual({
          [key]: value === null ? [] : Array.isArray(value) ? value : [value],
        })
      }
    }
    for (const { selector, attributes } of expected.links || []) {
      const link = $(selector)
      expect({ [selector]: link.length }).toEqual({ [selector]: 1 })
      for (const [key, value] of Object.entries(attributes))
        expect(link.attr(key)).toBe(value)
    }
  }

  for (const testCase of cases) {
    it(`renders the documented ${testCase.name} options`, async () => {
      const $ = await next.render$(`/${testCase.name}`)
      assertMetadata($, testCase.expected)
    })
  }

  it('supports the same options in static metadata and viewport exports', async () => {
    const $ = await next.render$('/static-export')
    const basic = getCase('basic').expected
    assertMetadata($, {
      ...basic,
      names: { ...basic.names, ...completeViewportExpected.names },
    })
  })

  it('retains media queries on theme color descriptors', async () => {
    const $ = await next.render$('/viewport-complete')
    expect(
      $('meta[name="theme-color"]')
        .map((_, tag) => $(tag).attr('media'))
        .get()
    ).toEqual(['(prefers-color-scheme: light)', '(prefers-color-scheme: dark)'])
  })

  it('inherits title templates and viewport fields while merging custom meta names', async () => {
    const $ = await next.render$('/inherited/child')
    assertMetadata($, {
      title: 'Child | Parent',
      names: {
        viewport:
          'width=device-width, initial-scale=1, maximum-scale=3, viewport-fit=cover',
        'theme-color': 'blue',
        parentOnly: 'parent',
        childOnly: 'child',
        overridden: 'child',
      },
    })
  })
})
