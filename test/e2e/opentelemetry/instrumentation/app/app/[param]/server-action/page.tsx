import { exportedServerAction } from './actions'

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
    </>
  )
}
