import { nextTestSetup } from 'e2e-utils'

// import.meta.glob is a Turbopack-only feature; skip under webpack
const testFn =
  process.env.IS_WEBPACK_TEST || process.env.NEXT_RSPACK
    ? describe.skip
    : describe

testFn('import-meta-glob', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  if (skipped) return

  it('should resolve lazy glob modules', async () => {
    const $ = await next.render$('/')
    const lazyKeys = JSON.parse($('#lazy-keys').text())
    expect(lazyKeys).toEqual([
      './modules/bar.ts',
      './modules/foo.ts',
      './modules/skip.ts',
    ])

    const lazyResults = JSON.parse($('#lazy-results').text())
    expect(lazyResults).toEqual({
      './modules/bar.ts': 'bar',
      './modules/foo.ts': 'foo',
      './modules/skip.ts': 'skip',
    })
  })

  it('should resolve eager glob modules', async () => {
    const $ = await next.render$('/')
    const eagerKeys = JSON.parse($('#eager-keys').text())
    expect(eagerKeys).toEqual([
      './modules/bar.ts',
      './modules/foo.ts',
      './modules/skip.ts',
    ])

    const eagerResults = JSON.parse($('#eager-results').text())
    expect(eagerResults).toEqual({
      './modules/bar.ts': 'bar',
      './modules/foo.ts': 'foo',
      './modules/skip.ts': 'skip',
    })
  })

  it('should resolve named import glob modules', async () => {
    const $ = await next.render$('/')
    const defaultResults = JSON.parse($('#default-results').text())
    expect(defaultResults).toEqual({
      './modules/bar.ts': 'bar-value',
      './modules/foo.ts': 'foo-value',
      './modules/skip.ts': 'skip-value',
    })
  })

  it('should support negative patterns', async () => {
    const $ = await next.render$('/')
    const filteredKeys = JSON.parse($('#filtered-keys').text())
    expect(filteredKeys).toEqual(['./modules/bar.ts', './modules/foo.ts'])

    const filteredResults = JSON.parse($('#filtered-results').text())
    expect(filteredResults).toEqual({
      './modules/bar.ts': 'bar',
      './modules/foo.ts': 'foo',
    })
  })

  it('should support multiple patterns', async () => {
    const $ = await next.render$('/')
    const multiKeys = JSON.parse($('#multi-keys').text())
    expect(multiKeys).toEqual([
      './modules/bar.ts',
      './modules/foo.ts',
      './modules/skip.ts',
      './other/baz.ts',
    ])

    const multiResults = JSON.parse($('#multi-results').text())
    expect(multiResults).toEqual({
      './modules/bar.ts': 'bar',
      './modules/foo.ts': 'foo',
      './modules/skip.ts': 'skip',
      './other/baz.ts': 'baz',
    })
  })
})
