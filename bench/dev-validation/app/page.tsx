import { FAMILIES } from './families'

// Landing page. The benchmark starts here, then drives navigation into each
// family's route. It renders no heavy tree of its own so the initial load stays
// cheap.
export default function Page() {
  return (
    <main>
      <h1 id="route">home</h1>
      <p>Dev-validation benchmark fixture.</p>
      <ul>
        {FAMILIES.map((family) => (
          <li key={family}>{family}</li>
        ))}
      </ul>
    </main>
  )
}
