'use server'

await Promise.resolve() // make this an async module

const EXPECTED_VALUE = 1

export async function runActionFromArgument(action: () => Promise<number>) {
  console.log('runActionFromArgument :: running action:', action)
  const result = await action()
  if (result !== EXPECTED_VALUE) {
    throw new Error(`Action did not return ${EXPECTED_VALUE}`)
  }
}

export async function myAction(): Promise<1> {
  console.log('hello from the server!')
  return EXPECTED_VALUE
}
