import { readCookie } from './read-cookie'

export default async function StaticPage() {
  return <p id="value">{await readCookie()}</p>
}
