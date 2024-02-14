// Rules here:
// 1. Each exported function should still be exported, but as a reference `createActionProxy(...)`.
// 2. Actual action functions should be renamed to `$$ACTION_...` and got exported.

async function foo() {
  'use server'
  console.log(1)
}

export { foo }

export async function bar() {
  'use server'
  console.log(2)
}

export default async function baz() {
  'use server'
  console.log(3)
}

export const qux = async () => {
  'use server'
  console.log(4)
}

export const quux = async function quuux() {
  'use server'
  console.log(5)
}
