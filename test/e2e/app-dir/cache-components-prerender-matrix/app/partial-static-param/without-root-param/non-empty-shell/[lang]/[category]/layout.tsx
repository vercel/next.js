import { Suspense, type ReactNode } from 'react'
import { Boundary } from '../../../../../../components/boundary'

// `category` is read in its own Suspense boundary (`lang` is read by the
// [lang] layout above): shells where it is concrete render it statically,
// and generic shells show `#category-fallback`. This makes the served
// shell's specialization observable from the static part of the response.
// The Boundary badge shows whether this segment was re-rendered for the
// current request.
async function LayoutImpl({
  children,
  params,
}: {
  children: ReactNode
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

export default function Layout(props: {
  children: ReactNode
  params: Promise<{ category: string }>
}) {
  return (
    <Suspense
      fallback={
        <Boundary name="[category] layout (loading...)">
          <div id="category-fallback" data-fallback>
            loading category...
          </div>
        </Boundary>
      }
    >
      <LayoutImpl {...props} />
    </Suspense>
  )
}
