import {
  exportedServerAction,
  failingServerAction,
  notFoundServerAction,
  redirectServerAction,
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
        <button id="run-exported-server-action">
          Run exported Server Action
        </button>
      </form>
      <form action={redirectServerAction}>
        <button id="run-redirect-server-action">
          Run redirect Server Action
        </button>
      </form>
      <form action={notFoundServerAction}>
        <button id="run-not-found-server-action">
          Run not-found Server Action
        </button>
      </form>
      <form action={failingServerAction}>
        <button id="run-failing-server-action">
          Run failing Server Action
        </button>
      </form>
    </>
  )
}
