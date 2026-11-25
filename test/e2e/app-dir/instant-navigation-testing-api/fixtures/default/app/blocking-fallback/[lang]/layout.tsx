import { ReactNode, Suspense } from 'react'

// `[lang]` is covered by generateStaticParams, so `/blocking-fallback/en` is a
// committed landing route. `[scope]` is not covered, so
// `/blocking-fallback/en/s1` is an on-demand fallback route. This layout owns
// the only <Suspense> boundary above that deeper segment, so its request-time
// work is held here rather than bailing the whole route.
export function generateStaticParams() {
  return [{ lang: 'en' }]
}

export default function LangLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <p data-testid="blocking-parent">parent</p>
      <Suspense fallback={<p data-testid="blocking-shell">shell</p>}>
        {children}
      </Suspense>
    </>
  )
}
