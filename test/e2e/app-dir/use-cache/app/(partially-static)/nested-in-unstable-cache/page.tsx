import { revalidatePath, unstable_cache } from 'next/cache'

async function inner() {
  'use cache'
  return Math.random()
}

const outer = unstable_cache(async () => {
  return inner()
})

export default async function Page() {
  return (
    <form
      action={async () => {
        'use server'
        revalidatePath('/nested-in-unstable-cache')
      }}
    >
      <p>{await outer()}</p>
      <button>Revalidate path</button>
    </form>
  )
}
