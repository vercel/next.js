import { validator } from 'auth'
import { Button } from 'components'

async function myAction(a, b, c) {
  'use server'
  console.log('a')
}

export default function Page() {
  return <Button action={myAction}>Delete</Button>
}

// TODO: should use `action` as function name?
export const action = validator(async () => {
  'use server'
})
