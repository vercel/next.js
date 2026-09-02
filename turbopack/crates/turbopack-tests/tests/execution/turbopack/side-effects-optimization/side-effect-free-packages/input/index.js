// The packages are imported by relative path so that the module paths still land in
// `node_modules`, which is what the `sideEffectFreePackages` glob matches on.
import '../../node_modules/package-declared-glob/esm/sidecar.js'
import '../../node_modules/package-declared-glob/esm/other.js'
import '../../node_modules/package-declared-side-effectful/register.js'
import '../../node_modules/package-undeclared/register.js'

import { effects as declaredGlobEffects } from '../../node_modules/package-declared-glob/effect.js'
import { effects as declaredSideEffectfulEffects } from '../../node_modules/package-declared-side-effectful/effect.js'
import { effects as undeclaredEffects } from '../../node_modules/package-undeclared/effect.js'

it('should keep modules matching the sideEffects glob of a package assumed to be side effect free', () => {
  expect(declaredGlobEffects).toEqual(['sidecar.js'])
})

it('should keep modules of a package declaring sideEffects: true even when it is assumed to be side effect free', () => {
  expect(declaredSideEffectfulEffects).toEqual(['register.js'])
})

it('should drop side effects of a package that declares no sideEffects', () => {
  expect(undeclaredEffects).toEqual([])
})
