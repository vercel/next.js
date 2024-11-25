export default async function Page(
  props: {
    params: Promise<{ slug: string }>
    searchParams: Promise<any>
  }
): Promise<JSX.Element> {
  const searchParams = await props.searchParams;

  const {
    search
  } = searchParams;

  const params = await props.params;

  const {
    slug
  } = params;

  // Access to the destructed properties
  slug
  search

  return <div>Page</div>
}
