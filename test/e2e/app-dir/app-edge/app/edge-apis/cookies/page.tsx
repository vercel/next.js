import { cookies } from 'next/headers'

export const runtime = 'edge'

export default function Page() {
  cookies()
  return <h1>Hello!</h1>
}
