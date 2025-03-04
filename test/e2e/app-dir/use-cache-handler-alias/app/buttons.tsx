import React from 'react'
import { unstable_expireTag } from 'next/cache'

export function RevalidateButtons() {
  return (
    <form>
      <button
        id="revalidate-custom"
        formAction={async () => {
          'use server'
          unstable_expireTag('custom')
        }}
      >
        revalidate custom tag
      </button>
    </form>
  )
}
