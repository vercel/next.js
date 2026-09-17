import { saveAction } from './actions'
import Counter from './counter'

export default function Page() {
  return (
    <main>
      <h1>Browser development tools</h1>
      <Counter />
      <form action={saveAction}>
        <button>Save</button>
      </form>
    </main>
  )
}
