'use client'

import { useState, useTransition } from 'react'

export function RevalidateButton({ lang }) {
  const [isPending, startTransition] = useTransition()
  const [result, setResult] = useState(null)

  function handleRevalidate(withSlash) {
    startTransition(async () => {
      try {
        const data = await fetch(
          `/api/revalidate/?lang=${lang}&withSlash=${withSlash}`
        ).then((res) => res.json())
        startTransition(() => {
          setResult(`Revalidated at: ${data.timestamp}`)
        })
      } catch (e) {
        startTransition(() => {
          setResult(`Error: ${e}`)
        })
      }
    })
  }

  return (
    <div>
      <button
        onClick={handleRevalidate.bind(null, true)}
        disabled={isPending}
        id="revalidate-button-with-slash"
      >
        {isPending ? 'Revalidating...' : `Revalidate /${lang}/`}
      </button>
      <button
        onClick={handleRevalidate.bind(null, false)}
        disabled={isPending}
        id="revalidate-button-no-slash"
      >
        {isPending ? 'Revalidating...' : `Revalidate /${lang} (no slash)`}
      </button>
      {result && <pre id="revalidate-result">{result}</pre>}
    </div>
  )
}
