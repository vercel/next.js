import { LightningCssLoader as loader } from './loader'

function runLoader(
  source: string,
  resolveImpl?: (context: any, request: any) => Promise<string>
) {
  const calls: Array<[any, any]> = []
  return new Promise<{ error: any; content: any; calls: Array<[any, any]> }>(
    (resolve) => {
      const ctx = {
        async: () => (error: any, content?: any) =>
          resolve({ error, content, calls }),
        getOptions: () => ({ url: true, import: true }),
        getResolve: () => async (context: any, request: any) => {
          calls.push([context, request])
          if (resolveImpl) {
            return resolveImpl(context, request)
          }
          return `/resolved/${request}`
        },
        context: '/project',
        rootContext: '/project',
        resourcePath: '/project/style.css',
        sourceMap: false,
        utils: { contextify: (_context: any, request: any) => request },
      }
      // @ts-expect-error -- partial loader context mock
      loader.call(ctx, source, null, null)
    }
  )
}

describe('lightningcss-loader url() handling', () => {
  it('leaves fragment-only url(#id) references untouched instead of resolving them', async () => {
    const { error, content, calls } = await runLoader(
      'svg { fill: url(#gradient) }',
      async () => {
        throw new Error('cannot resolve')
      }
    )
    expect(error).toBeNull()
    // The fragment reference is left in the CSS (lightningcss serializes it
    // with quotes) instead of being rewritten to a module placeholder.
    expect(content).toContain('#gradient')
    expect(content).not.toContain('__NEXT_LIGHTNINGCSS_LOADER_URL_REPLACE')
    // No module resolution should be attempted for fragment URLs.
    expect(calls).toEqual([])
  })

  it('still processes regular url() references as module requests', async () => {
    // When handleUrl processes a regular url it pushes a getUrl runtime
    // import, resolving require.resolve('../../css-loader/src/runtime/getUrl.js').
    // In jest that resolution fails because the repo only contains getUrl.ts
    // (the .js exists in built output), so reaching it proves './img.png' was
    // processed as a module request — i.e. the fragment guard above does not
    // over-block real urls. (Verified: jest.mock(virtual) does not affect
    // require.resolve, and we intentionally avoid writing shims into src.)
    const { error } = await runLoader('.a { background: url(./img.png) }')
    expect(error).not.toBeNull()
    expect(String(error?.message)).toContain('getUrl.js')
  })
})
