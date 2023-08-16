'use client'
import { useRouter } from 'next/navigation'
import { startTransition } from 'react'
import { useCallback } from 'react'
import { useState } from 'react'

export default function Page() {
  const [success, setSuccess] = useState(false)
  const [finishedRefresh, setFinishedRefresh] = useState(false)
  const router = useRouter()

  const handleClick = useCallback(() => {
    setSuccess(true)
    startTransition(() => {
      router.refresh()
      setFinishedRefresh(true)
    })
  }, [router])

  return (
    <>
      <button id="refresh-page" onClick={handleClick}>
        Trigger refresh and setState
      </button>
      <h1
        style={{
          backgroundColor: success ? '#228B22' : '#ccc',
          color: 'white',
        }}
      >
        The current page
      </h1>
      {finishedRefresh && (
        <div id="refreshed">Refreshed page successfully!</div>
      )}
    </>
  )
}
