export async function generateMetadata() {
  await new Promise((r) => setTimeout(r, 0))
  return { title: 'Dynamic Metadata' }
}

export default async function Page() {
  return (
    <>
      <p>
        This page is static except for metadata. Metadata can now be streamed in
        so if PPR is enabled we expect that the visual content of this page will
        be statically served and the metadata will be resumed dynamically. If
        this project is not PPR then we expect this page to just render
        dynamically.
      </p>
      <span id="sentinel">sentinel</span>
    </>
  )
}
