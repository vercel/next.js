import { local, namedFunction, default as defaultFunction } from 'lib'

function moduleIds() {
  return Array.from(__turbopack_modules__.keys())
}

it('imports locals of a module that also has reexports', () => {
  const logs = []
  const originalLog = console.log
  console.log = (...args) => logs.push(args)
  try {
    local()
  } finally {
    console.log = originalLog
  }
  expect(logs).toEqual([['This is a local function']])
  expect(typeof namedFunction).toBe('function')
  expect(typeof defaultFunction).toBe('function')
})

it('imports the locals from the locals part of the module', () => {
  const ids = moduleIds().filter((id) =>
    id.includes('/node_modules/lib/index.js ')
  )
  expect(ids).toEqual([expect.stringMatching(/ <locals>$/)])

  // The unused local is not exported anymore.
  const code = __turbopack_modules__.get(ids[0]).toString()
  const registration = code.match(/\.s\(\[([\s\S]*?)\]\)/)[1]
  expect(registration).toMatch(/\blocal\b/)
  expect(registration).not.toContain(['local', 'Unused'].join(''))
})
