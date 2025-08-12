export default async function Page(props) {
  const { slug } = await props.params

  return (
    <div data-page data-slug={slug}>
      This is the validation page: {slug}
    </div>
  )
}
