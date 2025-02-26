import { nextTestSetup } from 'e2e-utils'

function countSubstring(str: string, substr: string): number {
  return str.split(substr).length - 1
}

// The default ppr-metadata-blocking is covered by test/e2e/app-dir/ppr-metadata-streaming/ppr-metadata-streaming.test.ts
describe('ppr-metadata-blocking-ppr-fallback', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
    env: {
      __NEXT_EXPERIMENTAL_STATIC_SHELL_DEBUGGING: '1',
    },
  })

  if (skipped) return

  it('should not include metadata in partial shell when page is fully dynamic', async () => {
    const $ = await next.render$('/fully-dynamic?__nextppronly=fallback')
    expect(countSubstring($.html(), '<title>')).toBe(0)
  })

  it('should include viewport metadata in partial shell when metadata is dynamic under suspense', async () => {
    const $ = await next.render$(
      '/dynamic-metadata/partial?__nextppronly=fallback'
    )
    expect(countSubstring($.html(), '<title>')).toBe(0)
    expect(countSubstring($.html(), '<meta name="viewport"')).toBe(1)
  })

  it('should include viewport metadata in partial shell when page is partially dynamic', async () => {
    const $ = await next.render$('/dynamic-page/partial?__nextppronly=fallback')
    expect($('head title').text()).toBe('dynamic-page - partial')
    expect(countSubstring($.html(), '<title>')).toBe(1)
    expect(countSubstring($.html(), '<meta name="viewport"')).toBe(1)
  })
})
