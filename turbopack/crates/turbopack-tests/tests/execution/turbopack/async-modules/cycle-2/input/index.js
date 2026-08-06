import { A } from './A'
import { D } from './D'

/*
 * {A,B,C,D}.ts and asyncImportFn.ts have an import graph topology that
 * exposes a bug in `compute_async_module_info_single` in turbopack. Requesting
 * this page (localhost:3000/api/test) will fail with:
 *   TypeError: (0 , t.C) is not a function
 * This is because C has been marked as an async module, but D hasn't.
 *
 * route
 * |   \
 * v    v
 * A<-  D
 * |  \ |
 * v   \v
 * B--->C
 * |
 * v
 * async
 */

it('should handle cycles in async modules', () => {
  A(10)
  D(10)
  expect(true).toBe(true)
})
