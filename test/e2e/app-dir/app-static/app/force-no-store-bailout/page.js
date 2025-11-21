export const fetchCache = 'force-no-store'

export default async function Page() {
  // this should not be invoked during build as
  // no-store should have it bail out
  await fetch('https://non-existent', {
    cache: 'no-store',
  })

  return (
    <>
      <p id="page">/force-no-store-bailout</p>
      <p id="now">{Date.now()}</p>
    </>
  )
}
