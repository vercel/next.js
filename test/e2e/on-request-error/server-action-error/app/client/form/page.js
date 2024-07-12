export default function Page() {
  async function action(formData) {
    'use server'

    console.log('[form-action]', formData.get('payload'))
  }

  return (
    <form action={action}>
      <input type="hidden" name="payload" value={'payload-value'} />
      <button type="submit">submit</button>
    </form>
  )
}
