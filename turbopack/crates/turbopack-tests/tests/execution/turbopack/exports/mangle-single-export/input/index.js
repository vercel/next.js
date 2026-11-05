import { aLongFunctionNameNobodyWantsInTheBundle } from './lone'

function moduleCode(file) {
  const ids = Array.from(__turbopack_modules__.keys()).filter((id) =>
    id.includes(`/input/${file} `)
  )
  expect(ids).toHaveLength(1)
  return __turbopack_modules__.get(ids[0]).toString()
}

function callLone() {
  return aLongFunctionNameNobodyWantsInTheBundle()
}

it('keeps the value of a mangled single export correct', () => {
  expect(callLone()).toBe('lone')
})

it('emits the only export of a module under the fixed single-export key', () => {
  // Built dynamically so this test file itself doesn't contain the name.
  const name = ['aLongFunctionName', 'NobodyWantsInTheBundle'].join('')

  const lone = moduleCode('lone.js')
  expect(lone).toContain('s(["f",')
  expect(lone).not.toContain(name)

  const caller = callLone.toString()
  expect(caller).toMatch(/\.f\)\(\)/)
  expect(caller).not.toContain(name)
})
