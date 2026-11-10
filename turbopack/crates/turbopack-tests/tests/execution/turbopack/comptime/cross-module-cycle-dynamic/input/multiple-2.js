import { FOO as foo } from './multiple-1.js'
function foo2(left, right) {
  // might be an infinite loop at runtime, but shouldn't hang the build
  return foo(left, right)
}
export { foo2 as FOO }
