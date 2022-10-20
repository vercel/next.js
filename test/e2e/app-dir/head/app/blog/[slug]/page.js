export default function Page() {
  return (
    <>
      <p id="page">dynamic blog page</p>
    </>
  )
}

export async function Head({ params }) {
  return (
    <>
      <script async src="/hello3.js" data-slug={params.slug} />
      {/* TODO-APP: enable after react is updated to handle
      other head tags
      <title>hello from dynamic blog page {params.slug}</title> */}
    </>
  )
}
