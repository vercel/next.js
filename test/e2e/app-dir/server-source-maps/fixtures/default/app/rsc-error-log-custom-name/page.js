class UnnamedError extends Error {}
class NamedError extends Error {
  name = 'MyError'
}

export default function Page() {
  console.error(new UnnamedError('Foo'))
  console.error(new NamedError('Bar'))
  return null
}
