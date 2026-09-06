import { readValue } from './read-value'

export default async function SharedPage() {
  return <p>{await readValue()}</p>
}
