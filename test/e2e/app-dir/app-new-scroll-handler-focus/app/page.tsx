import { SearchBox } from './search-box'

// Rendered dynamically (force-dynamic is only honored on server components).
export const dynamic = 'force-dynamic'

export default function Page() {
  return (
    <>
      <SearchBox testId="search-input" />
      {/* Tall enough to scroll, so the scroll-to-top assertion is meaningful. */}
      <div data-testid="spacer" style={{ height: 3000 }} />
    </>
  )
}
