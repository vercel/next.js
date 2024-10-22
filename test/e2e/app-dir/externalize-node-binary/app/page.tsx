import { foo, bar } from 'foo'

export default function Page() {
  bar()
  return <p>{foo()}</p>
}
