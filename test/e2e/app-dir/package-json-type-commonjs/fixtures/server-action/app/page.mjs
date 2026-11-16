export default function Page() {
  return (
    <main>
      <form
        action={async () => {
          'use server'
          console.log('hello from server')
        }}
      ></form>
    </main>
  )
}
