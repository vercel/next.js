export async function generateViewport() {
  await new Promise((r) => setTimeout(r, 0))
  return { themeColor: 'black' }
}

export default async function Page() {
  return (
    <>
      <p>
        This page is static except for generateViewport which does some IO. This
        is a build error because metadata is not wrapped in a Suspense boundary.
        We expect that if you intended for your metadata to be dynamic you will
        ensure your page is dynamic too
      </p>
    </>
  )
}
