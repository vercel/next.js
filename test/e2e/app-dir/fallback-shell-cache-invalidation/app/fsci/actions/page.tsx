import { updateTag } from 'next/cache'

export default function Page() {
  return (
    <>
      <form
        action={async () => {
          'use server'
          updateTag('fallback-shell-cache-invalidation:slug:a')
        }}
      >
        <button id="update-slug-a">Update slug a</button>
      </form>
      <form
        action={async () => {
          'use server'
          updateTag('fallback-shell-cache-invalidation:shared')
        }}
      >
        <button id="update-shared">Update shared</button>
      </form>
    </>
  )
}
