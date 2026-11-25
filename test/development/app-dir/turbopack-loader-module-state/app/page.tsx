// @ts-expect-error -- transformed by the loader configured in next.config.js
import value from './value.txt'

export default function Page() {
  return <p id="value">{value}</p>
}
