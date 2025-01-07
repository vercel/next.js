import { connection } from 'next/server'

class UnnamedError extends Error {}
class NamedError extends Error {
  name = 'MyError'
}

export default async function Page() {
  await connection()

  console.error(new UnnamedError('Foo'))
  console.error(new NamedError('Bar'))
  return null
}
