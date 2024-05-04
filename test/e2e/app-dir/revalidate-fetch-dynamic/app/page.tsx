import { revalidatePath } from 'next/cache'
import Link from 'next/link'

export default function Home() {
  return (
    <div>
      <Link href="/dynamic/1">Link to dynamic route</Link>

      <form
        action={async () => {
          'use server'
          revalidatePath('/dynamic/1')
        }}
      >
        <button type="submit" id="revalidate-undefined">
          Revalidate dynamic route (type undefined)
        </button>
      </form>
      <form
        action={async () => {
          'use server'
          revalidatePath('/dynamic/1', 'page')
        }}
      >
        <button type="submit" id="revalidate-page">
          Revalidate dynamic route (type "page")
        </button>
      </form>
      <form
        action={async () => {
          'use server'
          revalidatePath('/dynamic/1', 'layout')
        }}
      >
        <button type="submit" id="revalidate-layout">
          Revalidate dynamic route (type "layout")
        </button>
      </form>
    </div>
  )
}
