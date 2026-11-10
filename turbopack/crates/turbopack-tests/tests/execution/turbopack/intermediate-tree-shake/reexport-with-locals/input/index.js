import { local, namedFunction, default as defaultFunction } from 'lib'
import { moduleIds } from '../../../__helpers__/module-factories.js'

it('imports locals of a module that also has reexports', () => {
  globalThis.reexportWithLocalsLog = []
  local()
  expect(globalThis.reexportWithLocalsLog).toEqual(['This is a local function'])
  expect(typeof namedFunction).toBe('function')
  expect(typeof defaultFunction).toBe('function')
})

it('imports the locals from the locals part of the module', () => {
  const ids = moduleIds('node_modules/lib/index.js')
  expect(ids).toEqual([expect.stringMatching(/ <locals>$/)])

  // The unused local is not exported anymore.
  const code = __turbopack_modules__.get(ids[0]).toString()
  const registration = code.match(/\.s\(\[([\s\S]*?)\]\)/)[1]
  expect(registration).toMatch(/\blocal\b/)
  expect(registration).not.toContain(['local', 'Unused'].join(''))
})
