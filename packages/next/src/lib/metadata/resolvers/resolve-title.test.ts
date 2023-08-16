import { resolveTitle } from './resolve-title'

describe('resolveTitle', () => {
  it('should resolve nullable template as empty string title', () => {
    expect(resolveTitle('', null)).toEqual({ absolute: '', template: null })
    expect(resolveTitle(null, null)).toEqual({ absolute: '', template: null })
  })

  it('should resolve title with template', () => {
    // returned template should equal the input title's template
    expect(resolveTitle('title', 'dash %s')).toEqual({
      absolute: 'dash title',
      template: null,
    })
    expect(
      resolveTitle({ default: 'title', template: '%s | absolute' }, 'dash %s')
    ).toEqual({ absolute: 'dash title', template: '%s | absolute' })
    expect(
      resolveTitle({ default: '', template: '%s | absolute' }, 'fake template')
    ).toEqual({ absolute: 'fake template', template: '%s | absolute' })
  })
})
