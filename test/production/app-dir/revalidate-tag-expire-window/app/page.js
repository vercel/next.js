import { getValue } from './get-value'

export default async function Page() {
  return <p id="value">{await getValue()}</p>
}
