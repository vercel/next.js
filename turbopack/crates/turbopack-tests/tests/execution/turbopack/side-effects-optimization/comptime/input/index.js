import { something } from 'package/dep.js'
import { something2 } from 'package/dep2.js'
import { something3 } from 'package-directive/dep.js'

it('should not include a module that is side effect free and exports are not used due to static analysis', () => {
  const modules = Object.keys(__turbopack_modules__)
  expect(modules).toContainEqual(
    expect.stringMatching(/input\/node_modules\/package\/dep2\.js/)
  )
  expect(modules).not.toContainEqual(
    expect.stringMatching(/input\/node_modules\/package\/dep\.js/)
  )

  if (true) {
    something2()
    return
  }
  something()
})

it('should not include a module that is side effect free via directive and exports are not used due to static analysis', () => {
  const modules = Object.keys(__turbopack_modules__)
  expect(modules).not.toContainEqual(
    expect.stringMatching(/input\/node_modules\/package-directive\/dep\.js/)
  )

  if (true) {
  } else {
    something3()
  }
})
