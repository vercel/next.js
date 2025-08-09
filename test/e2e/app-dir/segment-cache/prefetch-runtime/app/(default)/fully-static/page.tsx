export default async function Page() {
  return (
    <main>
      <h1>Fully static</h1>
      <p id="intro">Hello from a fully static page!</p>
      <p>
        {new Array({ length: 1000 })
          .fill(null)
          .map(() => 'Lorem ipsum dolor sit amet.')}
      </p>
    </main>
  )
}
