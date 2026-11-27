// Only the requests without a (supported) `turbopackOptional: true` comment are
// reported as issues (see `issues/`).

it('rejects a missing optional dynamic import at runtime without an issue', async () => {
  // turbopackOptional should suppress resolve errors silently
  await expect(
    import(/* turbopackOptional: true */ './missing.mjs')
  ).rejects.toThrow("Cannot find module './missing.mjs'")
})

it('throws for a missing optional require at runtime without an issue', () => {
  // require with turbopackOptional should also work
  expect(() => require(/* turbopackOptional: true */ './missing.cjs')).toThrow(
    "Cannot find module './missing.cjs'"
  )
})

it('reports an issue for missing imports that are not optional', async () => {
  // webpackOptional is NOT supported, so this should NOT suppress the error
  await expect(
    import(/* webpackOptional: true */ './missing-should-error-webpack.mjs')
  ).rejects.toThrow("Cannot find module './missing-should-error-webpack.mjs'")

  // turbopackOptional: false should still produce errors
  await expect(
    import(
      /* turbopackOptional: false */ './missing-should-error-optional-false.mjs'
    )
  ).rejects.toThrow(
    "Cannot find module './missing-should-error-optional-false.mjs'"
  )

  // Default behavior without any optional comment should produce errors
  await expect(import('./missing-should-error-default.mjs')).rejects.toThrow(
    "Cannot find module './missing-should-error-default.mjs'"
  )
})

it('resolves existing modules with an optional comment normally', async () => {
  await expect(
    import(/* turbopackOptional: true */ './existing.mjs')
  ).resolves.toHaveProperty('default', 'existing module (esm)')
  expect(require(/* turbopackOptional: true */ './existing.cjs')).toBe(
    'existing module (cjs)'
  )
})
