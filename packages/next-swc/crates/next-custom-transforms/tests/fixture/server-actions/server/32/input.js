export function Foo({ data, payload }) {
  async function action() {
    'use server'
    console.log(data.slice(0, 1), payload.user.id)
  }

  return <form action={action}>Hello</form>
}
