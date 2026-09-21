const loadChild = () => require('./child.js')

export const childValue = loadChild().childValue
export const entryValue = 'entry'

it('keeps an evaluation-time cycle reached through a local function', () => {
  expect(childValue).toBe('child')
  expect(loadChild().readEntry()).toBe('entry')

  const factory = __turbopack_modules__.get(
    [...__turbopack_modules__.keys()].find((moduleId) =>
      moduleId.endsWith(
        'scope-hoisting/circuit-breaker-local-call-edge/input/index.js [test] (ecmascript)'
      )
    )
  )
  const source = factory.toString()
  expect(source).toContain('()=>entryValue')
  expect(source.indexOf('()=>entryValue')).toBeLessThan(
    source.indexOf("const entryValue = 'entry'")
  )
})
