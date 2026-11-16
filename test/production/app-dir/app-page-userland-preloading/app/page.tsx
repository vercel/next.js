import { connection } from 'next/server'

function makeAction(value: string) {
  return async function action() {
    'use server'
    return value
  }
}

// This exercises real bound-argument encryption/decryption at module scope.
const action = makeAction('bound value')
const value = await action()
console.log('page-preload:bound-action-ready')
console.log('page-preload:page-loaded')

export default async function Page() {
  await connection()
  console.log('page-preload:rendered')
  return <p>{value}</p>
}
