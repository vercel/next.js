import { getCachedRandom } from 'my-pkg'

export default async function Page() {
  const one = await getCachedRandom()
  const two = await getCachedRandom()
  return (
    <main>
      <div>
        One: <span id="one">{one}</span>
      </div>
      <div>
        Two: <span id="two">{two}</span>
      </div>
      {one === two ? '✅ Cached' : '❌ Not cached'}
    </main>
  )
}
