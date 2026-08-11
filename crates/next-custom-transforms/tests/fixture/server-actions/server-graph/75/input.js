import { Client } from 'components'

export function Component() {
  const value = 3
  const obj = {}

  // `value` is not referenced in the closure's body, but it's used as
  // the default value for `<param0>.x`, so it still needs to be available
  const closedOverDefaultArgValue = async ({ x = value } = obj) => {
    'use server'
    return x
  }

  return <Client action={closedOverDefaultArgValue} />
}
