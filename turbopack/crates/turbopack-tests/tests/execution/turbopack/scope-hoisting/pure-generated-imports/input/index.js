import * as pureNamespace from './pure.js'
import * as effectfulNamespace from './effectful.js'
import * as asyncNamespace from './async.js'

const unusedPure = pureNamespace
const unusedEffectful = effectfulNamespace
const unusedAsync = asyncNamespace

it('removes only the dead import of a side-effect-free module', () => {
  expect(globalThis.__pureGeneratedImportsEffect).toBe(1)

  const factory = __turbopack_modules__.get(
    [...__turbopack_modules__.keys()].find((moduleId) =>
      moduleId.endsWith(
        'scope-hoisting/pure-generated-imports/input/index.js [test] (ecmascript)'
      )
    )
  )
  const source = factory.toString()
  // Assemble this at runtime so the assertion's own source does not contain the
  // substring we are checking for.
  const inputPath = ['pure-generated-imports', 'input'].join('/')
  expect(source).not.toContain(`${inputPath}/pure.js`)
  expect(source).toContain(`${inputPath}/effectful.js`)
  expect(source).toContain(`${inputPath}/async.js`)
})
