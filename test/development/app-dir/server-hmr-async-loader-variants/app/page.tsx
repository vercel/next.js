import { evaluatedAt } from '../lib/clock'

// Unrelated to the route with the async loader variants.
export default function Page() {
  return <p id="evaluated-at">{evaluatedAt}</p>
}
