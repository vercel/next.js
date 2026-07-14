export default function Page() {
  async function serverAction() {
    'use server'
  }

  return (
    <form action={serverAction}>
      <button id="run-server-action">Run Server Action</button>
    </form>
  )
}
