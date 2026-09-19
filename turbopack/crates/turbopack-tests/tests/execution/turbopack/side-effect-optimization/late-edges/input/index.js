import * as dynamicUnused from './dynamic-unused.js'
import * as requireUnused from './require-unused.js'
import * as deferredContexts from './deferred-contexts.js'
import * as evaluationContexts from './evaluation-contexts.js'
import { loadDynamic } from './dynamic-used.js'
import { loadRequire } from './require-used.js'

const unusedDynamic = dynamicUnused
const unusedRequire = requireUnused
const unusedDeferredContexts = deferredContexts
const unusedEvaluationContexts = evaluationContexts

it('separates evaluation-time and deferred module edges', async () => {
  expect(globalThis.__lateDynamicEffect).toBeUndefined()
  expect(globalThis.__lateRequireEffect).toBeUndefined()
  expect(globalThis.__evaluationContextEffect).toBe(true)

  const factory = __turbopack_modules__.get(
    [...__turbopack_modules__.keys()].find((moduleId) =>
      moduleId.endsWith(
        'side-effect-optimization/late-edges/input/index.js [test] (ecmascript)'
      )
    )
  )
  const source = factory.toString()
  const inputPath = ['side-effect-optimization', 'late-edges', 'input'].join(
    '/'
  )

  expect(source).not.toContain(`${inputPath}/dynamic-unused.js`)
  expect(source).not.toContain(`${inputPath}/require-unused.js`)
  expect(source).not.toContain(`${inputPath}/deferred-contexts.js`)
  expect(source).toContain(`${inputPath}/evaluation-contexts.js`)

  const dynamicModule = await loadDynamic()
  expect(dynamicModule.value).toBe('dynamic')
  expect(globalThis.__lateDynamicEffect).toBe(1)

  const requiredModule = loadRequire()
  expect(requiredModule.value).toBe('require')
  expect(globalThis.__lateRequireEffect).toBe(1)
})
