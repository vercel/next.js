import { headers } from 'next/headers'

export default async function NotFound() {
  return (
    <pre>
      {JSON.stringify(Array.from((await headers()).entries()), null, 2)}
    </pre>
  )
}
