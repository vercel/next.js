import { headers } from 'next/headers'

export const instant = false

export default async function Page() {
  await headers()

  return <p>hello world</p>
}
