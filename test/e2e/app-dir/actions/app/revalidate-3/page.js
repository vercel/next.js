'use client'
import { revalidateTestTag } from './action'
import { useEffect } from 'react'

export default function Page() {
  useEffect(() => {
    console.log('mount')

    return () => {
      console.log('unmount')
    }
  }, [])

  return (
    <div>
      <button
        id="revalidate-client"
        onClick={async () => {
          await revalidateTestTag()
        }}
      >
        Click me
      </button>
    </div>
  )
}
