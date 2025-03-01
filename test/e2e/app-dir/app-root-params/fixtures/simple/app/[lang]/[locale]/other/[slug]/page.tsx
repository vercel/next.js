import { cookies } from 'next/headers'
import { unstable_rootParams } from 'next/server'

export default async function Page({ params }) {
  await cookies()
  const { slug } = await params
  return (
    <div>
      <p id="dynamic-params">{slug}</p>
      <p id="root-params">{JSON.stringify(await unstable_rootParams())}</p>
    </div>
  )
}
