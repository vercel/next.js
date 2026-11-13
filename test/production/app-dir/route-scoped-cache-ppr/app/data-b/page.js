import { sharedData } from '../../lib/state'
export default async function Page() {
  return <p id="shared-data">{await sharedData()}</p>
}
