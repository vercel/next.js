import React from 'react'
import { revalidateTag } from 'next/cache'

export function RevalidateButtons() {
  return (
    <form>
      <button
        id="revalidate-a"
        formAction={async () => {
          'use server'
          revalidateTag('a')
        }}
      >
        revalidate a
      </button>
      <button
        id="revalidate-b"
        formAction={async () => {
          'use server'
          revalidateTag('b')
        }}
      >
        revalidate b
      </button>
      <button
        id="revalidate-c"
        formAction={async () => {
          'use server'
          revalidateTag('c')
        }}
      >
        revalidate c
      </button>
    </form>
  )
}
