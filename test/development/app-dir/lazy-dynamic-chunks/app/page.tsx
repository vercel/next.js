import { Demo } from './demo'

// This route is only ever compiled, never interacted with, so its lazy chunk stays
// unmaterialized for the whole run.
export default function Page() {
  return (
    <main>
      <Demo />
    </main>
  )
}
