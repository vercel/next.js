import { connection } from 'next/server'

export default async function TargetPage() {
  await connection()
  return <div id="build-id">Build ID: {process.env.NEXT_PUBLIC_BUILD_ID}</div>
}
