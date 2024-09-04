import { headers } from 'next/headers'

export default function Page() {
  headers()
  return <p>{'headers()'}</p>
}
