import { Button } from 'components'

async function myAction(a, b, c) {
  // comment
  'use strict'
  'use server'
  console.log('a')
}

export default function Page() {
  return <Button action={myAction}>Delete</Button>
}
