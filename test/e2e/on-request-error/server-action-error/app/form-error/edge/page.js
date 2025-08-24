export default function Page() {
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
export const dynamic = 'force-dynamic'
