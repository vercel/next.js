export async function generateViewport() {
  await new Promise((r) => setTimeout(r, 0))
  return { themeColor: 'black' }
}

export default async function Page() {
  return (
    <>
      <p>
        This page is static except for `generateViewport`. This is a build error
        because anything dynamic must be wrapped in a Suspense boundary. While
        you aren't directly in control of where viewport renders it semantically
        renders as part of the page preamble and so you must put a Suspense
        boundary around the root layout to opt into allowing dynamic in
        generateViewport.
      </p>
    </>
  )
}
