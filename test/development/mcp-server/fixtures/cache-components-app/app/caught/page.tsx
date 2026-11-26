import { cookies } from 'next/headers'

async function Cached() {
  'use cache'
  try {
    await cookies()
  } catch {
    return <p>Caught</p>
  }
  return <p>Unexpected</p>
}

export default function Page() {
  return <Cached />
}
