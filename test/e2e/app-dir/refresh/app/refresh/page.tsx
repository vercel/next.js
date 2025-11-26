import { triggerRefresh } from './actions'
import { connection } from 'next/server'

export default async function Page() {
  await connection()

  const timestamp = performance.now()

  return (
    <>
      <div id="server-timestamp">{timestamp}</div>
      <form action={triggerRefresh}>
        <button id="refresh-button" type="submit">
          Refresh
        </button>
      </form>
    </>
  )
}
