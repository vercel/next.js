'use server'

// Ensure side effects won't affect tree shaking and DCE
console.log('This is a side effect')

export async function foo() {
  console.log('This is action foo')
}

export async function bar() {
  console.log('This is action bar')
}

export async function baz() {
  console.log('This is action baz')
}
