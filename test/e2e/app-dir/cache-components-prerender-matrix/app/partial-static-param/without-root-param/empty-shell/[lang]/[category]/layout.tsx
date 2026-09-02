import { Boundary } from '../../../../../../components/boundary'

// Reads `category` with NO Suspense boundary (the empty-shell tree's
// convention). The rendered content is identical to the non-empty-shell
// tree's [category] layout — the only difference is the missing Suspense
// boundary.
export default async function CategoryLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ category: string }>
}) {
  const { category } = await params

  return (
    <Boundary name={`[category] layout (${category})`}>
      <div id="category">{category}</div>
      {children}
    </Boundary>
  )
}
