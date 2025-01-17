import { headers } from 'next/headers'
import { Suspense } from 'react'
import { setTimeout } from 'timers/promises'

async function Dynamic() {
  const agent = (await headers()).get('user-agent')

  return <div data-agent={agent}>{agent}</div>
}

export default async function Page(props) {
  const params = await props.params
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
