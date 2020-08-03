import { useRouter } from 'next/router'
import { useState } from 'react'

const invalidLink = 'https://vercel.com/'

export default function Page() {
  const { query, ...router } = useRouter()
  const [isDone, setIsDone] = useState(false)
  const { method = 'push' } = query

  function click(e) {
    router[method](invalidLink).then(
      () => setIsDone(true),
      () => setIsDone(true)
    )
  }

  return (
    <>
      <button id="click-me" onClick={click}>
        Click me
      </button>
      {isDone ? <div id="is-done">Done</div> : null}
    </>
  )
}
