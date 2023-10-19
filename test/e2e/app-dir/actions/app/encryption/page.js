export default function Page() {
  const secret = 'my password is qwerty123'

  return (
    <form
      action={async () => {
        'use server'
        console.log(secret)
        return 'success'
      }}
    >
      <button type="submit">Submit</button>
    </form>
  )
}
