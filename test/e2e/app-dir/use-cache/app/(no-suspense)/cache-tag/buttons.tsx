import React from 'react'
import { unstable_expirePath, unstable_expireTag } from 'next/cache'

export function RevalidateButtons() {
  return (
    <form>
      <button
        id="revalidate-a"
        formAction={async () => {
          'use server'
          unstable_expireTag('a')
        }}
      >
        revalidate a
      </button>{' '}
      <button
        id="revalidate-b"
        formAction={async () => {
          'use server'
          unstable_expireTag('b')
        }}
      >
        revalidate b
      </button>{' '}
      <button
        id="revalidate-c"
        formAction={async () => {
          'use server'
          unstable_expireTag('c')
        }}
      >
        revalidate c
      </button>{' '}
      <button
        id="revalidate-f"
        formAction={async () => {
          'use server'
          unstable_expireTag('f')
        }}
      >
        revalidate f
      </button>{' '}
      <button
        id="revalidate-r"
        formAction={async () => {
          'use server'
          unstable_expireTag('r')
        }}
      >
        revalidate r
      </button>{' '}
      <button
        id="revalidate-path"
        formAction={async () => {
          'use server'
          unstable_expirePath('/cache-tag')
        }}
      >
        revalidate path
      </button>
    </form>
  )
}
