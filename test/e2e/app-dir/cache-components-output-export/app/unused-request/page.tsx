import { headers } from 'next/headers'

export default function Page() {
  // Creating a request promise does not make a complete result dynamic.
  headers()
  return <p id="unused">Unused request promise</p>
}
