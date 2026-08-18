import { reportHost } from './actions'

// This page imports the action, so it is the only entry in the action's
// `workers` set. A POST carrying this action's id to any other route has to be
// forwarded here.
export default function Page() {
  return (
    <main>
      <h1 id="with-action-page">with-action</h1>
      <form action={reportHost}>
        <button id="run-action">Run action</button>
      </form>
    </main>
  )
}
