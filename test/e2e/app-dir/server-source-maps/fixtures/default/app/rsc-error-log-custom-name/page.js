class UnnamedError extends Error {}
class NamedError extends Error {
  name = 'MyError'
}

export default function Page() {
  console.error(new UnnamedError('rsc-error-log-custom-name-Foo'))
  console.error(new NamedError('rsc-error-log-custom-name-Bar'))
  return null
}
