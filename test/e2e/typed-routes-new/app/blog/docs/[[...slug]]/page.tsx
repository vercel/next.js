export default async function BlogDocsPage(
  props: PageProps<'/blog/docs/[[...slug]]'>
) {
  const params = await props.params

  return (
    <div>
      <h2>Blog Documentation</h2>
      <p>Docs path: {params.slug ? params.slug.join(' > ') : 'Root docs'}</p>
    </div>
  )
}
