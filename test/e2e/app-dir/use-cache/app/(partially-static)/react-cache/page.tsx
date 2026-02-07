import { cache } from 'react'

const number = cache(() => {
  return Math.random()
})

function Component() {
  // Read number again in a component. This should be deduped.
  return <p id="b">{number()}</p>
}

async function getCachedComponent() {
  'use cache'
  return (
    <div>
      <p id="a">{number()}</p>
      <Component />
    </div>
  )
}

export default async function Page() {
  return <div>{getCachedComponent()}</div>
}
