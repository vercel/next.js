import { evaluate, parse } from '../../lib/gate/expr'

const run = (source: string, values: Record<string, unknown> = {}) =>
  evaluate(parse(source).node, (name) => values[name])

describe('@gate expression language', () => {
  it('reads a bare condition by truthiness', () => {
    expect(run('a', { a: true })).toBe(true)
    expect(run('a', { a: false })).toBe(false)
    expect(run('a', {})).toBe(false)
    // A condition whose resolved value is an object (e.g. prefetchInlining).
    expect(run('a', { a: { maxSize: 2048 } })).toBe(true)
  })

  it('supports negation', () => {
    expect(run('!a', { a: false })).toBe(true)
    expect(run('!!a', { a: false })).toBe(false)
  })

  it('supports && and ||', () => {
    expect(run('a && b', { a: true, b: true })).toBe(true)
    expect(run('a && b', { a: true, b: false })).toBe(false)
    expect(run('a || b', { a: false, b: true })).toBe(true)
    expect(run('!a && b', { a: false, b: true })).toBe(true)
  })

  it('supports parentheses', () => {
    expect(run('!(a && b)', { a: true, b: false })).toBe(true)
    expect(run('!a && (b || c)', { a: false, b: false, c: true })).toBe(true)
  })

  it('compares against string literals', () => {
    expect(run("mode === 'start'", { mode: 'start' })).toBe(true)
    expect(run("mode === 'start'", { mode: 'dev' })).toBe(false)
    expect(run('mode !== "dev"', { mode: 'start' })).toBe(true)
    expect(run("mode == 'dev'", { mode: 'dev' })).toBe(true)
  })

  it('compares against booleans', () => {
    expect(run('a === false', { a: false })).toBe(true)
    expect(run('a === true', { a: undefined })).toBe(false)
  })

  it('collects the referenced condition names, deduplicated', () => {
    expect(parse("!a && (b || a) && c === 'x'").names).toEqual(['a', 'b', 'c'])
    expect(parse("mode === 'dev'").names).toEqual(['mode'])
  })

  it.each([
    ['', 'Unexpected end of expression'],
    ['a &&', 'Unexpected end of expression'],
    ['(a', 'Missing closing `)`'],
    ['a b', 'after a complete expression'],
    ["'unterminated", 'Unterminated string'],
    ['a # b', 'Unexpected character'],
  ])('reports a syntax error for %p', (source, message) => {
    expect(() => parse(source)).toThrow(message)
  })
})
