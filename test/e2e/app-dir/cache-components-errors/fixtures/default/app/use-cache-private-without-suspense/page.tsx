export default function Page() {
  return (
    <>
      <p>
        This page uses `'use cache: private'` without wrapping it in a Suspense
        boundary. In the context of prerenders, private caches are considered
        dynamic, so they need to be wrapped in a Suspense boundary. Otherwise,
        it triggers an error.
      </p>
      <Private />
    </>
  )
}

async function Private() {
  'use cache: private'

  return <p>Private</p>
}
