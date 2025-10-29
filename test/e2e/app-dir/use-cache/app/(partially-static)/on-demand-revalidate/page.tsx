import { revalidatePath } from 'next/cache'
import { RevalidateButtons } from './revalidate-buttons'

async function cachedValue() {
  'use cache'
  return Math.random()
}

export default async function Page() {
  const value = await cachedValue()
  return (
    <div>
      <p id="value">{value}</p>
      <RevalidateButtons
        revalidatePath={async () => {
          'use server'
          revalidatePath('/on-demand-revalidate')
        }}
      />
    </div>
  )
}
