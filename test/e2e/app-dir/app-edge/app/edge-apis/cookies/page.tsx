import { cookies } from 'next/headers'

export const runtime = 'edge'
export const preferredRegion = 'home'

export default function Page() {
  cookies()
  return <h1>Hello!</h1>
}
