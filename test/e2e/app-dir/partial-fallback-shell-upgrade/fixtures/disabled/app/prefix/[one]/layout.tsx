import { Suspense, type ReactNode } from 'react'

type LayoutProps = {
  children: ReactNode
  params: Promise<{ one: string }>
}

export function generateStaticParams() {
  return [{ one: 'b' }]
}

async function LayoutImpl({ children, params }: LayoutProps) {
  const { one } = await params

  return (
    <div>
      <div id="one">{one}</div>
      {children}
    </div>
  )
}

export default async function LayoutWrapper(props: LayoutProps) {
  return (
    <Suspense
      fallback={
        <div id="one-fallback" data-fallback>
          loading one...
        </div>
      }
    >
      <LayoutImpl {...props} />
    </Suspense>
  )
}
