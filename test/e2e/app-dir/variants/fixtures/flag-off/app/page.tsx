import { theme } from '../variants'

// This fixture leaves `experimental.variants` unset. Defining the variant that
// this page imports therefore fails, and the read below never runs.
export default async function Page() {
  return <p id="theme">{await theme()}</p>
}
