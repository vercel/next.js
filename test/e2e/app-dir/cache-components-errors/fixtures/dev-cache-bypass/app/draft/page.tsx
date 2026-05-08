export default async function Page() {
  return (
    <main>
      <section>
        <CachedData />
      </section>
    </main>
  )
}

async function CachedData() {
  'use cache'

  await new Promise((r) => setTimeout(r, 2000))

  return <p>{99}</p>
}
