import { SearchBox } from '../search-box'

// Same input as `/`, but prerendered static (no force-dynamic).
export default function StaticPage() {
  return <SearchBox testId="static-search-input" />
}
