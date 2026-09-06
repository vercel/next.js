/* eslint-env jest */
const { rewrite } = require('../../lib/gate/pragma-transform')

// NOTE: fixtures are built by joining arrays of lines instead of using template
// literals. A template literal containing a `// @gate` line directly above an
// `it(` line would itself be rewritten when *this* file is transformed, since
// the rewrite is intentionally a line-oriented regex over the raw source.
const src = (...lines: string[]) => lines.join('\n') + '\n'

describe('@gate pragma transform', () => {
  it('leaves files without a pragma untouched (identity, not a copy)', () => {
    const input = src("it('a', () => {})")
    expect(rewrite(input, 'x.test.ts')).toBe(input)
  })

  it('rewrites a single pragma over `it`', () => {
    const out = rewrite(
      src('// @gate !cacheComponents', "it('a', () => {})"),
      'x.test.ts'
    )
    expect(out).toBe(
      src(
        '// @gate !cacheComponents',
        `_test_gate([{"force":false,"source":"!cacheComponents"}],"it")('a', () => {})`
      )
    )
  })

  it('preserves indentation and line count', () => {
    const input = src(
      'describe(() => {',
      '  // @gate dev',
      "  it('a', () => {",
      '    expect(1).toBe(1)',
      '  })',
      '})'
    )
    const out = rewrite(input, 'x.test.ts')
    expect(out.split('\n')).toHaveLength(input.split('\n').length)
    expect(out.split('\n')[2]).toBe(
      `  _test_gate([{"force":false,"source":"dev"}],"it")('a', () => {`
    )
    // Every line other than the rewritten call site is byte-identical.
    const inLines = input.split('\n')
    const outLines = out.split('\n')
    for (let i = 0; i < inLines.length; i++) {
      if (i === 2) continue
      expect(outLines[i]).toBe(inLines[i])
    }
  })

  it('combines consecutive pragmas', () => {
    const out = rewrite(
      src('// @gate dev', '// @force-gate turbopack', "test('a', () => {})"),
      'x.test.ts'
    )
    expect(out.split('\n')[2]).toBe(
      `_test_gate([{"force":false,"source":"dev"},{"force":true,"source":"turbopack"}],"test")('a', () => {})`
    )
  })

  it('rewrites a `@force-gate`-only file (no `@gate` substring)', () => {
    // Guards the cheap bail-out: `@force-gate` does not contain `@gate`.
    const input = src(
      '// @force-gate !cacheComponents',
      "describe('s', () => {})"
    )
    expect(input.includes('@gate')).toBe(false)
    const out = rewrite(input, 'x.test.ts')
    expect(out.split('\n')[1]).toBe(
      `_test_gate([{"force":true,"source":"!cacheComponents"}],"describe")('s', () => {})`
    )
  })

  it.each([
    ['it', 'it'],
    ['test', 'test'],
    ['fit', 'fit'],
    ['describe', 'describe'],
    ['it.only', 'it.only'],
    ['test.only', 'test.only'],
    ['describe.only', 'describe.only'],
  ])('supports %s', (callee, kind) => {
    const out = rewrite(src('// @gate dev', `${callee}('a', () => {})`), 'x.ts')
    expect(out.split('\n')[1]).toBe(
      `_test_gate([{"force":false,"source":"dev"}],${JSON.stringify(
        kind
      )})('a', () => {})`
    )
  })

  it('keeps the condition source verbatim, including quotes', () => {
    const out = rewrite(
      src("// @gate mode === 'start' && !turbopack", "it('a', () => {})"),
      'x.test.ts'
    )
    expect(out.split('\n')[1]).toBe(
      `_test_gate([{"force":false,"source":"mode === 'start' && !turbopack"}],"it")('a', () => {})`
    )
  })

  describe('inert pragmas are hard errors', () => {
    it('rejects a pragma separated from the call by a blank line', () => {
      expect(() =>
        rewrite(src('// @gate dev', '', "it('a', () => {})"), 'x.test.ts')
      ).toThrow('this `@gate` pragma has no effect')
    })

    it('rejects a pragma inside a JSDoc block', () => {
      expect(() =>
        rewrite(
          src('/**', ' * some docs', ' */', '// @gate dev', 'const x = 1'),
          'x.test.ts'
        )
      ).toThrow('this `@gate` pragma has no effect')
    })

    it('rejects a pragma over it.each', () => {
      expect(() =>
        rewrite(src('// @gate dev', 'it.each([1])("a", () => {})'), 'x.test.ts')
      ).toThrow('this `@gate` pragma has no effect')
    })

    it('rejects a pragma over it.skip as ambiguous', () => {
      expect(() =>
        rewrite(src('// @gate dev', "it.skip('a', () => {})"), 'x.test.ts')
      ).toThrow('a `@gate` pragma on a skipped test is ambiguous')
    })

    it('rejects a pragma over xit / xdescribe / it.todo as ambiguous', () => {
      for (const call of [
        "xit('a', () => {})",
        "xdescribe('a', () => {})",
        "it.todo('a')",
        "describe.skip('a', () => {})",
      ]) {
        expect(() => rewrite(src('// @gate dev', call), 'x.test.ts')).toThrow(
          'a `@gate` pragma on a skipped test is ambiguous'
        )
      }
    })

    it('rejects a stacked pragma block over a skip, pointing at the first pragma', () => {
      expect(() =>
        rewrite(
          src('// @force-gate !dev', '// @gate dev', "xit('a', () => {})"),
          'x.test.ts'
        )
      ).toThrow(/x\.test\.ts:1[\s\S]*ambiguous/)
    })

    it('leaves a skip without a pragma alone', () => {
      const input = src(
        '// @gate dev',
        "it('gated', () => {})",
        "xit('skipped', () => {})",
        "it.skip('also skipped', () => {})"
      )
      const out = rewrite(input, 'x.test.ts')
      expect(out).toContain("xit('skipped', () => {})")
      expect(out).toContain("it.skip('also skipped', () => {})")
    })

    it('reports the file and line', () => {
      expect(() =>
        rewrite(src('const x = 1', '// @gate dev', 'const y = 2'), 'x.test.ts')
      ).toThrow('x.test.ts:2')
    })

    it('rejects a pragma with no condition', () => {
      expect(() =>
        rewrite(src('// @gate', "it('a', () => {})"), 'x.test.ts')
      ).toThrow('needs a condition')
    })
  })

  it('does not match prose comments that merely mention the word', () => {
    const input = src(
      '// Use @gate to mark a known failure.',
      "it('a', () => {})"
    )
    expect(rewrite(input, 'x.test.ts')).toBe(input)
  })
})
