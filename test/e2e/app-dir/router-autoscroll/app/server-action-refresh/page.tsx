import { refreshAction } from './actions'
import { connection } from 'next/server'

export default async function Page() {
  await connection()

  const timestamp = Date.now()

  return (
    <>
      <div style={{ height: '200vh' }} />
      <form action={refreshAction}>
        <button id="refresh-button" type="submit">
          Refresh
        </button>
      </form>
      <div id="server-timestamp">{timestamp}</div>
      <div style={{ height: '200vh' }} />
    </>
  )
}
