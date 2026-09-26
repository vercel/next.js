import { FOO as foo } from './single.js'
function foo1(left, right) {
  // might be an infinite loop at runtime, but shouldn't hang the build
  return foo(left, right)
}
export { foo1 as FOO }
