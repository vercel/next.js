import { connection } from 'next/server'
import { refreshAction } from '../server-action-refresh/actions'
import { Search } from './search'

export default async function Page() {
  await connection()

  const timestamp = Date.now()

  return (
    <>
      <div style={{ height: '200vh' }} />
      <Search />
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
