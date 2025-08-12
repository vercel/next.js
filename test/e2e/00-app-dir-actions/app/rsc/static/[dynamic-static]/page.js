import { revalidatePath } from 'next/cache'

export default async function Page() {
  async function serverAction() {
    'use server'
    await new Promise((resolve) => setTimeout(resolve, 1000))
    revalidatePath('/dynamic')
  }

  return (
    <form action={serverAction}>
      <button>Submit</button>
    </form>
  )
}
