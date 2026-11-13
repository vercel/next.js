export default function Page() {
  async function action() {
    'use server'
  }
  return (
    <form action={action}>
      <button>Requires a server</button>
    </form>
  )
}
