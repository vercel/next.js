// This is technically unnecessary, because this page is static
// and a runtime prefetch won't do any better than a static one,
// but it's useful to exercise this codepath.
// In the future, this test can be used to check whether we correctly
// *skip* a runtime prefetch if a page was prerendered as static.
export const unstable_prefetch = {
  mode: 'runtime',
  samples: [{ cookies: [] }],
}

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
