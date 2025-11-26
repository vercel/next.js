import { Client } from './client'

export default async function Page() {
  async function b() {
    'use server'
  }

  async function foo(a) {
    'use server'
    console.log('result:', a === b)
  }

  return <Client foo={foo} b={b} />
}
