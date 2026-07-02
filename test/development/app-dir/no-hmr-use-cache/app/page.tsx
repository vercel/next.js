import { getCachedValue } from './data'

export default async function Page() {
  const value = await getCachedValue()
  return <p id="cached-value">{value}</p>
}
