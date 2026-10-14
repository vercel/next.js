import { readValue } from './read-value'

export default async function Page() {
  return <p>{await readValue()}</p>
}
