import value from 'analyzed-default' with { turbopackConstants: 'true' }

if (value !== 'dev') require('./marker')

function readValue() {
  return value
}

it('shares default export constants with analyzer-aware inlining', () => {
  expect(readValue()).toBe('dev')
  expect(readValue.toString()).toContain('TURBOPACK compile-time value')

  const modules = Array.from(__turbopack_modules__.keys())
  expect(modules).not.toContainEqual(expect.stringMatching(/input\/marker\.js/))
  expect(modules).not.toContainEqual(
    expect.stringMatching(/node_modules\/analyzed-default\/index\.js/)
  )
})
