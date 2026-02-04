export default async function Page({ params }) {
  return (
    <>
      <p id="page">/postpone/isr/[slug]</p>
      <p id="params">{JSON.stringify(await params)}</p>
      <p id="now">{Date.now()}</p>
    </>
  )
}
