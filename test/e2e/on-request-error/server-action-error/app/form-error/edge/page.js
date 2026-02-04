import { connection } from 'next/server'

export default async function Page() {
  await connection()
  async function action(formData) {
    'use server'

    throw new Error('[server-action]:form:edge')
  }

  return (
    <form action={action}>
      <input type="hidden" name="payload" value={'payload-value'} />
      <button type="submit">submit</button>
    </form>
  )
}

export const runtime = 'edge'
