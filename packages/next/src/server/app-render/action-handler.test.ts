import { parseHostHeader } from './action-handler'

describe('parseHostHeader', () => {
  it('should return correct host', () => {
    expect(parseHostHeader({})).toBe(undefined)

    expect(
      parseHostHeader({
        host: 'www.foo.com',
      })
    ).toEqual({ type: 'host', value: 'www.foo.com' })

    expect(
      parseHostHeader({
        host: undefined,
        'x-forwarded-host': 'www.foo.com',
      })
    ).toEqual({ type: 'x-forwarded-host', value: 'www.foo.com' })

    expect(
      parseHostHeader({
        host: 'www.foo.com',
        'x-forwarded-host': undefined,
      })
    ).toEqual({ type: 'host', value: 'www.foo.com' })
  })

  it('should return x-forwarded-host over host header', () => {
    expect(
      parseHostHeader({
        host: 'www.foo.com',
        'x-forwarded-host': 'www.bar.com',
      })
    ).toEqual({ type: 'x-forwarded-host', value: 'www.bar.com' })
  })

  it('should return correct x-forwarded-host when provided in array', () => {
    expect(
      parseHostHeader({
        host: 'www.foo.com',
        'x-forwarded-host': ['www.bar.com', 'www.baz.com'],
      })
    ).toEqual({ type: 'x-forwarded-host', value: 'www.bar.com' })

    expect(
      parseHostHeader({
        host: 'www.foo.com',
        'x-forwarded-host': [],
      })
    ).toEqual({ type: 'host', value: 'www.foo.com' })

    expect(
      parseHostHeader({
        host: 'www.foo.com',
        'x-forwarded-host': 'www.bar.com, www.baz.com',
      })
    ).toEqual({ type: 'x-forwarded-host', value: 'www.bar.com' })
  })

  it('should return whichever matches provided origin', () => {
    expect(
      parseHostHeader(
        {
          host: 'www.foo.com',
          'x-forwarded-host': ['www.bar.com', 'www.baz.com'],
        },
        'www.foo.com'
      )
    ).toEqual({ type: 'host', value: 'www.foo.com' })

    expect(
      parseHostHeader(
        {
          host: 'www.foo.com',
          'x-forwarded-host': ['www.bar.com'],
        },
        'www.bar.com'
      )
    ).toEqual({ type: 'x-forwarded-host', value: 'www.bar.com' })

    expect(
      parseHostHeader(
        {
          host: 'www.foo.com',
          'x-forwarded-host': 'www.bar.com, www.baz.com',
        },
        'www.bar.com'
      )
    ).toEqual({ type: 'x-forwarded-host', value: 'www.bar.com' })
  })
})
