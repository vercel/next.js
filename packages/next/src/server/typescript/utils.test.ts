import { getDynamicSegmentParams } from './utils'

describe('utils', () => {
  it('should generate the correct dynamic segment', () => {
    const filePathUnix = '/username/home/my-app/src/app/some-page/[id]/page.js'
    const filePathWindows =
      '\\username\\home\\my-app\\src\\app\\some-page\\[id]\\page.js'

    const dynamicSegmentParamsUnix = getDynamicSegmentParams(filePathUnix)
    const dynamicSegmentParamsWindows = getDynamicSegmentParams(filePathWindows)

    expect(dynamicSegmentParamsUnix).toEqual({
      params: ['id', 'name'],
      isCatchAll: false,
    })

    expect(dynamicSegmentParamsWindows).toEqual({
      params: ['id', 'name'],
      isCatchAll: false,
    })
  })

  it('should generate the correct dynamic segments (nested)', () => {
    const filePathUnix =
      '/username/home/my-app/src/app/some-page/[id]/some-other-page/[name]/page.js'
    const filePathWindows =
      '\\username\\home\\my-app\\src\\app\\some-page\\[id]\\some-other-page\\[name]\\page.js'

    const dynamicSegmentParamsUnix = getDynamicSegmentParams(filePathUnix)
    const dynamicSegmentParamsWindows = getDynamicSegmentParams(filePathWindows)

    expect(dynamicSegmentParamsUnix).toEqual({
      params: ['id', 'name'],
      isCatchAll: false,
    })

    expect(dynamicSegmentParamsWindows).toEqual({
      params: ['id', 'name'],
      isCatchAll: false,
    })
  })

  it('should generate the correct dynamic segments (catch all)', () => {
    const filePathUnix =
      '/username/home/my-app/src/app/some-page/[...name]/page.js'
    const filePathWindows =
      '\\username\\home\\my-app\\src\\app\\some-page\\[...name]\\page.js'

    const dynamicSegmentParamsUnix = getDynamicSegmentParams(filePathUnix)
    const dynamicSegmentParamsWindows = getDynamicSegmentParams(filePathWindows)

    expect(dynamicSegmentParamsUnix).toEqual({
      params: 'name',
      isCatchAll: true,
      isOptionalCatchAll: false,
    })

    expect(dynamicSegmentParamsWindows).toEqual({
      params: 'name',
      isCatchAll: true,
      isOptionalCatchAll: false,
    })
  })

  it('should generate the correct dynamic segments (optional catch all)', () => {
    const filePathUnix =
      '/username/home/my-app/src/app/some-page/[...name?]/page.js'
    const filePathWindows =
      '\\username\\home\\my-app\\src\\app\\some-page\\[...name?]\\page.js'

    const dynamicSegmentParamsUnix = getDynamicSegmentParams(filePathUnix)
    const dynamicSegmentParamsWindows = getDynamicSegmentParams(filePathWindows)

    expect(dynamicSegmentParamsUnix).toEqual({
      params: 'name',
      isCatchAll: true,
      isOptionalCatchAll: true,
    })

    expect(dynamicSegmentParamsWindows).toEqual({
      params: 'name',
      isCatchAll: true,
      isOptionalCatchAll: true,
    })
  })

  it("should return an empty array if there's no dynamic segments", () => {
    const filePathUnix = '/username/home/my-app/src/app/some-page/page.js'
    const filePathWindows =
      '\\username\\home\\my-app\\src\\app\\some-page\\page.js'

    const dynamicSegmentParamsUnix = getDynamicSegmentParams(filePathUnix)
    const dynamicSegmentParamsWindows = getDynamicSegmentParams(filePathWindows)

    expect(dynamicSegmentParamsUnix).toEqual({
      params: [],
      isCatchAll: false,
    })

    expect(dynamicSegmentParamsWindows).toEqual({
      params: [],
      isCatchAll: false,
    })
  })
})
