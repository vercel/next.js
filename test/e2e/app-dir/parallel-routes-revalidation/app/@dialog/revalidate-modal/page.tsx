import Link from 'next/link'

import { revalidatePath } from 'next/cache'
import { addData } from '../../actions'

export default function Page() {
  async function createItem() {
    'use server'

    await addData(new Date().toISOString())

    revalidatePath('/', 'layout')
  }

  return (
    <dialog open>
      <h1>Modal</h1>

      <br />

      <form action={createItem}>
        <button type="submit" className="button" id="create-entry">
          Create New Item
        </button>
      </form>

      <Link href="/">Close</Link>
    </dialog>
  )
}
