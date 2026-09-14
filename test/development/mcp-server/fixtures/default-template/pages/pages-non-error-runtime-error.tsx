export default function PagesNonErrorRuntimeErrorPage() {
  if (typeof window !== 'undefined') {
    // eslint-disable-next-line no-throw-literal -- Testing a non-Error thrown value.
    throw 'Test Pages non-Error runtime error'
  }

  return <p>Server render</p>
}
