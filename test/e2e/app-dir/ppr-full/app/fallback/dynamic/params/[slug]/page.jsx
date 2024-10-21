import { headers } from 'next/headers'
import { Suspense } from 'react'
import { setTimeout } from 'timers/promises'

function Dynamic() {
  const agent = headers().get('user-agent')

  return <div data-agent={agent}>{agent}</div>
}

export default async function Page({ params }) {
  await setTimeout(1000)

  const { slug } = params

  return (
    <div>
      <div data-slug={slug}>{slug}</div>
      <Suspense>
        <Dynamic />
      </Suspense>
    </div>
  )
}
