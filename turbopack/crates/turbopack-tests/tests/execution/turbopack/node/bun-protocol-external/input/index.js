const loadBun = () => import('./bun.js')

it('treats Bun builtins as externals', async () => {
  // Bun builtins are not available in Node.js, so requiring them at runtime
  // fails. They are not resolved at build time.
  await expect(loadBun()).rejects.toThrow("Cannot find module 'bun:ffi'")

  const ids = Array.from(__turbopack_modules__.keys())
  for (const name of [
    'bun:ffi',
    'bun:jsc',
    'bun:sqlite',
    'bun:test',
    'bun:wrap',
    'bun',
  ]) {
    expect(ids).toContain(`[externals]/${name} [external] (${name}, cjs)`)
  }
})
