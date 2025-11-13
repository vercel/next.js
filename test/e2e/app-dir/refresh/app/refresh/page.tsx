import { triggerRefresh } from './actions'

export default function Page() {
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
