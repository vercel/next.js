export default async function Page() {
  await new Promise((resolve) => setTimeout(resolve, 5000))
  return (
    <>
      <p id="static-page">Static Page</p>
    </>
  )
}
