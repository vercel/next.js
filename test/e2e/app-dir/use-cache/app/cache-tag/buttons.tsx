import React from 'react'
import { revalidatePath, revalidateTag } from 'next/cache'

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
      </button>{' '}
      <button
        id="revalidate-b"
        formAction={async () => {
          'use server'
          revalidateTag('b')
        }}
      >
        revalidate b
      </button>{' '}
      <button
        id="revalidate-c"
        formAction={async () => {
          'use server'
          revalidateTag('c')
        }}
      >
        revalidate c
      </button>{' '}
      <button
        id="revalidate-f"
        formAction={async () => {
          'use server'
          revalidateTag('f')
        }}
      >
        revalidate f
      </button>{' '}
      <button
        id="revalidate-r"
        formAction={async () => {
          'use server'
          revalidateTag('r')
        }}
      >
        revalidate r
      </button>{' '}
      <button
        id="revalidate-path"
        formAction={async () => {
          'use server'
          revalidatePath('/cache-tag')
        }}
      >
        revalidate path
      </button>
    </form>
  )
}
