'use server'

export async function foo() {
  console.log('action foo')
}

export async function bar() {
  console.log('action bar')
}

export default async function () {
  console.log('action bar')
}
