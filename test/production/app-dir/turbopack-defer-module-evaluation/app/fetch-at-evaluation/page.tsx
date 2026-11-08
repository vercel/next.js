import { fetched } from '../../lib/declared/fetch-at-evaluation'

export default async function Page() {
  return <p id="fetched">{await fetched}</p>
}
