export default async function BlogCategoriesPage(
  props: PageProps<'/blog/categories/[...slug]'>
) {
  const params = await props.params

  return (
    <div>
      <h2>Blog Categories</h2>
      <p>Category path: {params.slug.join(' > ')}</p>
    </div>
  )
}
