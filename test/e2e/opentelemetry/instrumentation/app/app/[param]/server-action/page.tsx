import defaultServerAction, {
  exportedServerAction,
  notFoundServerAction,
  rejectingNonErrorServerAction,
  redirectingServerAction,
  throwingServerAction,
} from './actions'

export default function Page() {
  async function inlineServerAction() {
    'use server'
  }

  return (
    <>
      <form action={inlineServerAction}>
        <button id="run-inline-server-action">Run inline Server Action</button>
      </form>
      <form action={exportedServerAction}>
        <input
          name="private-action-value"
          defaultValue="private-action-value"
        />
        <button id="run-exported-server-action">
          Run exported Server Action
        </button>
      </form>
      <form action={defaultServerAction}>
        <button id="run-default-server-action">
          Run default Server Action
        </button>
      </form>
      <form action={throwingServerAction}>
        <button id="run-throwing-server-action">
          Run throwing Server Action
        </button>
      </form>
      <form action={rejectingNonErrorServerAction}>
        <button id="run-rejecting-non-error-server-action">
          Run non-Error rejecting Server Action
        </button>
      </form>
      <form action={redirectingServerAction}>
        <button id="run-redirecting-server-action">
          Run redirecting Server Action
        </button>
      </form>
      <form action={notFoundServerAction}>
        <button id="run-not-found-server-action">
          Run not-found Server Action
        </button>
      </form>
    </>
  )
}
