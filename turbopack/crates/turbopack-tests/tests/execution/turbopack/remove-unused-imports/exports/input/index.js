import { used } from './a.js'

function moduleCode(file) {
  const ids = Array.from(__turbopack_modules__.keys()).filter((id) =>
    id.includes(`/input/${file} `)
  )
  expect(ids).toHaveLength(1)
  return __turbopack_modules__.get(ids[0]).toString()
}

function isBundled(file) {
  return Array.from(__turbopack_modules__.keys()).some((id) =>
    id.includes(`/input/${file} `)
  )
}

it('removes imports only used by unused exports', () => {
  expect(used()).toBe(1234)

  // `x` is only used by the unused export `unused`, `y` is used for its side
  // effects.
  expect(globalThis.xBundled).toBeUndefined()
  expect(globalThis.yBundled).toBe(true)
  expect(isBundled('library/x.js')).toBe(false)
  expect(isBundled('library/y.js')).toBe(true)
})

it('removes unused exports of transitively imported modules', () => {
  // `shared.js` and `leaf.js` are still needed by `y`, but only their `*Y`
  // exports are used, so they are the only exports registered.
  const shared = moduleCode('library/shared.js')
  expect(shared).toMatch(/\.s\(\[\s*"\w+",\s*0,\s*sharedY\s*\]\)/)

  const leaf = moduleCode('library/leaf.js')
  expect(leaf).toMatch(/\.s\(\[\s*"\w+",\s*0,\s*leafY\s*\]\)/)
})
