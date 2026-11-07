// The dynamic root `not-found.tsx` would otherwise make this page dynamic too.
export const dynamic = 'force-static'

async function action() {
  'use server'
  console.log('__app-static-action__')
}

export default function Page() {
  return (
    <form action={action}>
      <p>app static page</p>
      <button type="submit">submit</button>
    </form>
  )
}
