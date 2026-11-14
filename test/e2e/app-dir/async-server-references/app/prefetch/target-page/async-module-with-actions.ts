'use server'

await Promise.resolve() // make this an async module

export async function action() {
  console.log('hello from the server!')
}
