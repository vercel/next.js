import { readDirect } from '../read-direct'

export default async function Page() {
  return <p>{await readDirect()}</p>
}
