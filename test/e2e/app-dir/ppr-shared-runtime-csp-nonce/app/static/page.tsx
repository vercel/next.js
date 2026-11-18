import { Counter } from '../counter'

// Fully static: prerendered without a postponed state.
export default function Page() {
  return (
    <main>
      <h1 id="static">static</h1>
      <Counter />
    </main>
  )
}
