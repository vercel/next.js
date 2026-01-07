export default async function CatchAllPage({
  params,
}: {
  params: Promise<{ slug: string[] }>
}) {
  const { slug } = await params
  return (
    <div>
      <h2>Catch-All Leaf Segment Page</h2>
      <p>This is a catch-all route with parallel routes but NO child routes.</p>
      <p className="slug-info">Current path: /{slug.join('/')}</p>
      <p>
        No default.tsx files are required for @header or @footer because there
        are no child routes to navigate to.
      </p>
    </div>
  )
}

export async function generateStaticParams() {
  return [{ slug: ['a', 'b', 'c'] }]
}
