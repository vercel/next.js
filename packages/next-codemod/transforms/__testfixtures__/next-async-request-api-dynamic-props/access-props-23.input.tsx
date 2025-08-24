export default function Page({
  params: { slug },
  searchParams: { search },
}: {
  params: { slug: string }
  searchParams: any
}): JSX.Element {
  // Access to the destructed properties
  slug
  search

  return <div>Page</div>
}
