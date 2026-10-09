import { revalidatePath } from 'next/cache'

export default function Page() {
  async function myAction() {
    'use server'
    revalidatePath('/action-page')
  }

  return (
    <>
      <h1 id="action-heading">action page</h1>
      <form action={myAction}>
        <button id="trigger-action" type="submit">
          Submit
        </button>
      </form>
    </>
  )
}
