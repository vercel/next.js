import React from 'react'
import { expirePath, expireTag } from 'next/cache'

export function RevalidateButtons() {
  return (
    <form>
      <button
        id="revalidate-a"
        formAction={async () => {
          'use server'
          expireTag('a')
        }}
      >
        revalidate a
      </button>{' '}
      <button
        id="revalidate-b"
        formAction={async () => {
          'use server'
          expireTag('b')
        }}
      >
        revalidate b
      </button>{' '}
      <button
        id="revalidate-c"
        formAction={async () => {
          'use server'
          expireTag('c')
        }}
      >
        revalidate c
      </button>{' '}
      <button
        id="revalidate-f"
        formAction={async () => {
          'use server'
          expireTag('f')
        }}
      >
        revalidate f
      </button>{' '}
      <button
        id="revalidate-r"
        formAction={async () => {
          'use server'
          expireTag('r')
        }}
      >
        revalidate r
      </button>{' '}
      <button
        id="revalidate-path"
        formAction={async () => {
          'use server'
          expirePath('/cache-tag')
        }}
      >
        revalidate path
      </button>
    </form>
  )
}
