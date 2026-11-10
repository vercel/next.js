import { Suspense, type ReactNode } from 'react'

// `category` is read in its own Suspense boundary: shells where it is
// concrete render it statically, and generic shells show
// `#category-fallback`. This makes the served shell's specialization
// observable from the static part of the response. (`lang` is a root param
// and is part of the document itself, rendered by the root layout.)
async function LayoutImpl({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ category: string }>
}) {
  const { category } = await params

  return (
    <div>
      <div id="category">{category}</div>
      {children}
    </div>
  )
}

export default function Layout(props: {
  children: ReactNode
  params: Promise<{ category: string }>
}) {
  return (
    <Suspense
      fallback={
        <div id="category-fallback" data-fallback>
          loading category...
        </div>
      }
    >
      <LayoutImpl {...props} />
    </Suspense>
  )
}
