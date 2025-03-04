import { revalidatePath, revalidateTag } from 'next/cache'
import { redirect } from 'next/navigation'

export default function Page() {
  return (
    <form>
      <button
        id="revalidate-tag-redirect"
        formAction={async () => {
          'use server'

          revalidateTag('a')
          redirect('/cache-tag')
        }}
      >
        Revalidate tag and redirect
      </button>{' '}
      <button
        id="revalidate-path-redirect"
        formAction={async () => {
          'use server'

          revalidatePath('/cache-tag')
          redirect('/cache-tag')
        }}
      >
        Revalidate path and redirect
      </button>
    </form>
  )
}
