import { connection } from 'next/server'

class UnnamedError extends Error {}
class NamedError extends Error {
  name = 'MyError'
}

export default async function Page() {
  await connection()

  console.error(new UnnamedError('rsc-error-log-custom-name-Foo'))
  console.error(new NamedError('rsc-error-log-custom-name-Bar'))
  return null
}
