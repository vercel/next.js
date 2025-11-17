import { revalidatePath, updateTag } from 'next/cache'
import { redirect } from 'next/navigation'

export default function Page() {
  return (
    <form>
      <button
        id="revalidate-tag-redirect"
        formAction={async () => {
          'use server'

          updateTag('revalidate-and-redirect')
          redirect('/revalidate-and-redirect')
        }}
      >
        Revalidate tag and redirect
      </button>{' '}
      <button
        id="revalidate-path-redirect"
        formAction={async () => {
          'use server'

          revalidatePath('/revalidate-and-redirect')
          redirect('/revalidate-and-redirect')
        }}
      >
        Revalidate path and redirect
      </button>
    </form>
  )
}
