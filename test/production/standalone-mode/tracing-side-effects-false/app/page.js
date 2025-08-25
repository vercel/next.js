import getValue from '@next-test-tracing-side-effects-false/foo'

export default function Page() {
  return <p>{getValue()}</p>
}
