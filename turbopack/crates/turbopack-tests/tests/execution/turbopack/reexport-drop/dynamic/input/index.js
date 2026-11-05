function bundledCode() {
  return Array.from(__turbopack_modules__.values(), (factory) =>
    factory.toString()
  ).join('\n')
}

it('drops an unused reexport of a dynamically imported module', async () => {
  const { used } = await import('./lib.js')
  expect(used).toBe('USED')

  // Built dynamically so this test file itself doesn't contain the marker.
  expect(bundledCode()).not.toContain(['UNUSED', 'MARKER'].join('_'))
})
