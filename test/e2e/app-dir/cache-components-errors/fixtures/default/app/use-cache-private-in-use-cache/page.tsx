export default async function Page() {
  'use cache'

  return (
    <>
      <p>
        This page nests `'use cache: private'` in `'use cache'`, which triggers
        an error.
      </p>
      <Private />
    </>
  )
}

async function Private() {
  'use cache: private'

  return <p>Private</p>
}
