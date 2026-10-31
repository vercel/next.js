import { revalidatePath, revalidateTag } from 'next/cache'

async function revalidateTagAction() {
  'use server'
  revalidateTag('custom-tag', 'max')
}

async function revalidatePathAction() {
  'use server'
  revalidatePath('/revalidate-target')
}

export default function Page() {
  return (
    <>
      <form action={revalidateTagAction}>
        <button id="revalidate-tag">revalidate tag</button>
      </form>
      <form action={revalidatePathAction}>
        <button id="revalidate-path">revalidate path</button>
      </form>
    </>
  )
}
