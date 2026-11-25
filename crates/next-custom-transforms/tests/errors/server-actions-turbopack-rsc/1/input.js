'use client'
'use strict'

export default function Page() {
  return (
    <form
      action={async () => {
        'use server'
      }}
    />
  )
}
