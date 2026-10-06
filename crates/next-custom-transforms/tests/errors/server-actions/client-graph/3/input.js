'use client'

export default function Page() {
  return (
    <form
      action={async () => {
        'use server'
      }}
    />
  )
}
