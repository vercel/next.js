export default async function Home() {
  const user = await getUser()
  const signedIn = user !== null

  async function greet() {
    'use server'

    if (signedIn) {
      console.log('hello', user.name)
    } else {
      console.log('hello guest')
    }
  }

  return (
    <form action={greet}>
      <button>Greet</button>
    </form>
  )
}
