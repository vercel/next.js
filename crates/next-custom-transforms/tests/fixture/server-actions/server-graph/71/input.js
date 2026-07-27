// shadow the builtin Object global (used in transform output)
const Object = {}

export async function foo() {
  'use cache'
  return 1
}
