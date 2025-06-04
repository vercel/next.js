export default function Page() {
  async function action(formData) {
    'use server'

    throw new Error('[server-action]:form')
  }

  return (
    <form action={action}>
      <input type="hidden" name="payload" value={'payload-value'} />
      <button type="submit">submit</button>
    </form>
  )
}

export const dynamic = 'force-dynamic'
