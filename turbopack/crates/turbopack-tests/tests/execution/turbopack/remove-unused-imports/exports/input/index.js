import { used } from './a.js'
import {
  hasModuleFactory,
  moduleCode,
} from '../../../__helpers__/module-factories.js'

it('removes imports only used by unused exports', () => {
  expect(used()).toBe(1234)

  // `x` is only used by the unused export `unused`, `y` is used for its side
  // effects.
  expect(globalThis.xBundled).toBeUndefined()
  expect(globalThis.yBundled).toBe(true)
  expect(hasModuleFactory('library/x.js')).toBe(false)
  expect(hasModuleFactory('library/y.js')).toBe(true)
})

it('removes unused exports of transitively imported modules', () => {
  // `shared.js` and `leaf.js` are still needed by `y`, but only their `*Y`
  // exports are used, so they are the only exports registered.
  const shared = moduleCode('library/shared.js')
  expect(shared).toMatch(/\.s\(\[\s*"\w+",\s*0,\s*sharedY\s*\]\)/)

  const leaf = moduleCode('library/leaf.js')
  expect(leaf).toMatch(/\.s\(\[\s*"\w+",\s*0,\s*leafY\s*\]\)/)
})
