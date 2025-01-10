import { hello } from 'package-with-optional-deps'

export default function Page() {
  return <h1>{hello()}</h1>
}
