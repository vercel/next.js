import { getCachedRandomWithHandler } from 'my-pkg'

export default async function Page() {
  const one = await getCachedRandomWithHandler()
  const two = await getCachedRandomWithHandler()
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
