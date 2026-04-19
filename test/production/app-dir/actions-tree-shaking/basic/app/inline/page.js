export default function Page() {
  // Inline Server Action
  async function inlineServerAction() {
    'use server'
    return 'inline-server-action'
  }

  return (
    <form action={inlineServerAction}>
      <button type="submit">Submit</button>
    </form>
  )
}
