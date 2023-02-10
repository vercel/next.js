export default async function Head({ params }) {
  return (
    <>
      <script async src="/hello3.js" data-slug={params.slug} />
      <title>{`hello from dynamic blog page ${params.slug}`}</title>
    </>
  )
}
