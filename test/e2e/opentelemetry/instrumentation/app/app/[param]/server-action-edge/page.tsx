import { exportedServerAction } from '../server-action/actions'

export const runtime = 'edge'

export default function Page() {
  return (
    <form action={exportedServerAction}>
      <button id="run-edge-server-action">Run Edge Server Action</button>
    </form>
  )
}
