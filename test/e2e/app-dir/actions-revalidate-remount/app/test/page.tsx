import React from 'react'
import { revalidatePath } from 'next/cache'

export default async function HomePage() {
  await new Promise((resolve) => setTimeout(resolve, 200))
  return (
    <div>
      <p id="time">Time: {Date.now()}</p>
      <form
        action={async () => {
          'use server'
          revalidatePath('/test')
        }}
      >
        <button>Submit</button>
      </form>
    </div>
  )
}
