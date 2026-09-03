export default function Page() {
  async function myAction() {
    'use server'
  }
  return (
    <form action={myAction}>
      <button type="submit">Submit</button>
    </form>
  )
}
