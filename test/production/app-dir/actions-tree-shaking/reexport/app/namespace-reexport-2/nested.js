'use server'

export async function foo() {
  console.log('action: test-2')
}

export async function getFoo() {
  return foo
}
