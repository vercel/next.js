export async function generateViewport() {
  await new Promise((r) => setTimeout(r, 0))
  return { themeColor: 'black' }
}

export default async function Page() {
  return (
    <>
      <p>
        This page is static except for `generateViewport`. The root layout wraps
        the document body in a Suspense boundary, which is an explicit opt-in to
        a fully dynamic shell. With that opt-in, a dynamic `generateViewport`
        should not error the build and should not show a redbox in dev.
      </p>
      <span id="sentinel">sentinel</span>
    </>
  )
}
