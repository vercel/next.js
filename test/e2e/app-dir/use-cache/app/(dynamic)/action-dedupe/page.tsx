import { cacheTag, updateTag } from 'next/cache'
import { connection } from 'next/server'
import { setTimeout } from 'timers/promises'

let invocations = 0

async function getData(params: { id: number }) {
  'use cache'
  cacheTag('action-dedupe')
  return `${params.id}:${++invocations}`
}

// Each call passes a fresh object literal so the React.cache memo misses on
// reference equality, and the delay puts the second call outside the in-flight
// dedupe window. Both calls therefore depend on a stored entry being reused.
async function readTwice() {
  const first = await getData({ id: 1 })
  await setTimeout(100)
  const second = await getData({ id: 1 })

  return { first, second }
}

export default async function Page() {
  await connection()

  const { first, second } = await readTwice()

  return (
    <div>
      <p className="first">{first}</p>
      <p className="second">{second}</p>
      <form>
        <button
          id="revalidate"
          formAction={async () => {
            'use server'
            const { first: a1, second: a2 } = await readTwice()
            console.log(`action-dedupe: revalidate action read ${a1} ${a2}`)
            updateTag('action-dedupe')
          }}
        >
          Read twice and revalidate
        </button>{' '}
        <button
          id="no-revalidate"
          formAction={async () => {
            'use server'
            const { first: a1, second: a2 } = await readTwice()
            console.log(`action-dedupe: plain action read ${a1} ${a2}`)
          }}
        >
          Read twice only
        </button>
      </form>
    </div>
  )
}
