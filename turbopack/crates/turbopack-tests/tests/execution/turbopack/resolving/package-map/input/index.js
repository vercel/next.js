import dep, { shared as sharedOfDep } from 'dep'
import sub from 'dep/sub'
import shared from 'shared'
import aliased from 'aliased'
import scoped from '@scope/pkg'
import scopedSub from '@scope/pkg/sub'
import legacy from 'legacy'
import legacyFile from 'legacy/lib/file'
import singleFile from 'single-file'
import self from 'app/self'
import depThroughImports from '#dep'

it('should locate packages with the package map instead of node_modules', () => {
  // `node_modules/dep` exists too, and is not the package the map selects.
  expect(dep).toBe('dep@1.0.0')
  expect(scoped).toBe('@scope/pkg@1.0.0')
})

it('should resolve inside of the package as usual', () => {
  // exports field
  expect(sub).toBe('dep@1.0.0/sub')
  expect(scopedSub).toBe('@scope/pkg@1.0.0/sub')
  // main field
  expect(legacy).toBe('legacy@1.0.0')
  // files and extensions of a package without exports field
  expect(legacyFile).toBe('legacy@1.0.0/lib/file')
})

it('should not resolve a subpath that the exports field does not expose', () => {
  expect(() => require('dep/private.js')).toThrow()
})

it('should give each package its own dependencies', () => {
  expect(shared).toBe('shared@2.0.0')
  expect(sharedOfDep).toBe('shared@1.0.0')
})

it('should resolve a dependency by the name it is declared with', () => {
  expect(aliased).toBe('shared@1.0.0')
})

it('should resolve a package that consists of a single file', () => {
  expect(singleFile).toBe('single-file')
  expect(() => require('single-file/sub')).toThrow()
})

it('should still resolve self-references and package imports', () => {
  expect(self).toBe('self')
  expect(depThroughImports).toBe('dep@1.0.0')
})

it('should resolve requests with a dynamic subpath', () => {
  const load = (name) => require(`legacy/lib/${name}`)
  expect(load('file').default).toBe('legacy@1.0.0/lib/file')
})

it('should not resolve a package that is not a dependency of the importer', () => {
  // In the package map, but not a dependency of this package.
  expect(() => require('hidden')).toThrow()
  expect(() => require('#hidden')).toThrow()
  // In `node_modules`, but not in the package map.
  expect(() => require('only-in-node-modules')).toThrow()
})

it('should not resolve a dependency that the package map cannot locate', () => {
  expect(() => require('undefined-id')).toThrow()
  expect(() => require('not-installed')).toThrow()
})
