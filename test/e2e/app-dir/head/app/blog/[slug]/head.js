export default async function Head(props) {
  const title =
    props.searchParams?.title ||
    `hello from dynamic blog page ${props.params.slug}`
  return (
    <>
      <script async src="/hello3.js" data-slug={props.params.slug} />
      <title>{title}</title>
    </>
  )
}
