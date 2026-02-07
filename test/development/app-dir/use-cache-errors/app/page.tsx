'use client'

import { useActionState } from 'react'
import { useCachedStuff } from './module-with-use-cache'

function OtherClientComponent({
  getCachedStuff,
}: {
  getCachedStuff: () => Promise<string>
}) {
  const [result, formAction] = useActionState(getCachedStuff, null)

  return (
    <form action={formAction}>
      <button id="action-button">Submit</button>
      <p>{result}</p>
    </form>
  )
}

export default function Page() {
  return <OtherClientComponent getCachedStuff={useCachedStuff} />
}
