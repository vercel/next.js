import { fakeCat } from './module'
import { bundledCode } from '../../../__helpers__/module-factories.js'

// Built dynamically so this test file itself doesn't contain the names.
const removedNames = [
  ['get', 'Dog'],
  ['set', 'Dog'],
  ['dog', 'Ref'],
  ['initial', 'Cat'],
  ['get', 'Chimera'],
].map((parts) => parts.join(''))

it('keeps the side effects of the module', () => {
  // The order of the side effects relative to the `dog += '!'` updates is
  // currently not preserved with module fragments, see the
  // `__skipped__/side-effect-order` test.
  expect(globalThis.dogLogs).toHaveLength(3)
})

it('imports the renamed reexport', () => {
  expect(fakeCat).toBe('cat')
})

it('removes the unused exports', () => {
  const code = bundledCode()
  for (const name of removedNames) {
    expect(code).not.toContain(name)
  }
})
