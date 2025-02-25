import { revalidatePath, revalidateTag } from 'next/cache'
import { LinkAccordion } from '../components/link-accordion'
import Link from 'next/link'

export default async function Page() {
  return (
    <>
      <form>
        <button
          id="revalidate-by-path"
          formAction={async function () {
            'use server'
            revalidatePath('/greeting')
          }}
        >
          Revalidate by path
        </button>
        <button
          id="revalidate-by-tag"
          formAction={async function () {
            'use server'
            revalidateTag('random-greeting')
          }}
        >
          Revalidate by tag
        </button>
      </form>
      <ul>
        <li>
          <LinkAccordion href="/greeting">
            Link to target page with prefetching enabled
          </LinkAccordion>
        </li>
        <li>
          <Link prefetch={false} href="/greeting">
            Link to target with prefetching disabled
          </Link>
        </li>
      </ul>
    </>
  )
}
