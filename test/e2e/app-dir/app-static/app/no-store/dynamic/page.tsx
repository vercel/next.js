import { getUncachedRandomData } from '../no-store-fn'

export default async function Page() {
  const uncachedData = await getUncachedRandomData()

  return (
    <div>
      <p>random: {Math.random()}</p>
      <p id="uncached-data">uncachedData: {uncachedData.random}</p>
    </div>
  )
}
