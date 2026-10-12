import * as starReexport from './s1-lib'
import * as starImportExport from './s2-lib'
import { a as namedReexport } from './s3-lib'
import { a as namedImportExport } from './s4-lib'
import defaultNamespace from './s5-lib'

it('narrows `import * as` through `export * as` at three levels', () => {
  expect(starReexport.a.b.c.leaf).toBe('leaf')
  expect(starReexport.a.b.c.siblingUsed).toBe(false)
  expect(starReexport.a.b.bUnusedInfo).toBe(false)
  expect(starReexport.a.aUnusedInfo).toBe(false)
})

it('narrows `import * as` through `import * as X; export { X }` at three levels', () => {
  expect(starImportExport.a.b.c.leaf).toBe('leaf')
  expect(starImportExport.a.b.c.siblingUsed).toBe(false)
  expect(starImportExport.a.b.bUnusedInfo).toBe(false)
})

it('narrows a namespace-valued named import through `export * as` at three levels', () => {
  expect(namedReexport.b.c.leaf).toBe('leaf')
  expect(namedReexport.b.c.siblingUsed).toBe(false)
  expect(namedReexport.b.bUnusedInfo).toBe(false)
})

it('narrows a namespace-valued named import through `import * as X; export { X }` at three levels', () => {
  expect(namedImportExport.b.c.leaf).toBe('leaf')
  expect(namedImportExport.b.c.siblingUsed).toBe(false)
  expect(namedImportExport.b.bUnusedInfo).toBe(false)
})

it('narrows a default-exported namespace through a renamed namespace reexport', () => {
  expect(defaultNamespace.b.c.leaf).toBe('leaf')
  expect(defaultNamespace.b.c.siblingUsed).toBe(false)
})
