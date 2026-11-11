import { parseTestTypecheckConfig } from 'next/dist/experimental/testing/typecheck'

describe('typecheck startup configuration', () => {
  it('leaves the omitted delay absent instead of inventing a numeric default', () => {
    const config = parseTestTypecheckConfig({ enabled: true }, 'test.typecheck')
    expect(config.enabled).toBe(true)
    expect(Object.hasOwn(config, 'spawnTimeout')).toBe(false)
    expect(config.spawnTimeout).toBeUndefined()
  })

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['false', false],
    ['true', true],
    ['negative', -1],
    ['zero', 0],
    ['one', 1],
    ['fraction', 1.5],
    ['documented default', 10000],
    ['maximum native timer', 2147483647],
    ['overflow', 2147483648],
    ['NaN', NaN],
    ['Infinity', Infinity],
    ['numeric string', '2'],
    ['nonnumeric string', 'bad'],
    ['object', {}],
    ['array', []],
  ])(
    'preserves the authored %s delay for native timer handling',
    (_name, value) => {
      const config = parseTestTypecheckConfig(
        { enabled: true, spawnTimeout: value },
        'test.typecheck'
      )
      expect(config.enabled).toBe(true)
      expect(Object.hasOwn(config, 'spawnTimeout')).toBe(true)
      expect(config.spawnTimeout).toBe(value)
    }
  )

  it('retains zero even when checking is disabled', () => {
    const config = parseTestTypecheckConfig(
      { enabled: false, spawnTimeout: 0 },
      'test.typecheck'
    )
    expect(config.enabled).toBe(false)
    expect(config.spawnTimeout).toBe(0)
  })

  it.each([
    { checker: 'other', spawnTimeout: 0 },
    { build: true, spawnTimeout: 0 },
    { spawnTimout: 0 },
  ])('keeps unsupported options refused: %p', (config) => {
    expect(() => parseTestTypecheckConfig(config, 'test.typecheck')).toThrow(
      /Unsupported test.typecheck/
    )
  })

  it('preserves the existing enabled Boolean contract', () => {
    expect(() =>
      parseTestTypecheckConfig(
        { enabled: 'yes', spawnTimeout: 0 },
        'test.typecheck'
      )
    ).toThrow('test.typecheck.enabled must be a boolean.')
  })
})
