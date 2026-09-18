import { edgeServerAction } from './actions'

export const runtime = 'edge'

export default function Page() {
  return (
    <form action={edgeServerAction}>
      <button id="run-edge-server-action">Run Edge Server Action</button>
    </form>
  )
}
