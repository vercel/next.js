import { Metadata } from 'next'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  'use cache: remote'

  // Use `eval` to side step compiler errors for using `arguments` in a 'use
  // cache' function.
  // eslint-disable-next-line no-eval
  const unusedParentArg = eval('arguments')[1]
  if (unusedParentArg !== undefined) {
    throw new Error(
      'Expected the unused parent argument to be omitted. Received: ' +
        unusedParentArg
    )
  }

  // We're reading params here. This makes the cache function dynamic during
  // prerendering, and thus the description should be excluded from the
  // partially prerendered page.
  const { slug } = await params

  return { description: new Date().toISOString(), category: slug }
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return <main>{children}</main>
}
