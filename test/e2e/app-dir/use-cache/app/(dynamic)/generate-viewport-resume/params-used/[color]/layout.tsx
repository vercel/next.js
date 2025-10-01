import { Viewport } from 'next'

export async function generateViewport({
  params,
}: {
  params: Promise<{ color: string }>
}): Promise<Viewport> {
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
  // prerendering. It also requires suspense above body, so nothing will
  // prerendered. The meta tag should still be cached on refreshes though.
  const { color } = await params

  return {
    colorScheme: color === 'white' ? 'light' : 'dark',
    maximumScale: 1 + Math.random(),
  }
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return <main>{children}</main>
}
