export default async function Home() {
  const user = await getUser()

  async function greet() {
    'use server'
    console.log('hello', user?.name)
  }

  return (
    <form action={greet}>
      <button>Greet</button>
    </form>
  )
}
