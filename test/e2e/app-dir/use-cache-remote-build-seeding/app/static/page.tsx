import { getCachedDate } from '../cached-date'

export default async function Page() {
  return <p id="cached-date">{await getCachedDate()}</p>
}
