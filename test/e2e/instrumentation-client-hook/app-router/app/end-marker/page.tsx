// JSX treats lowercase-first tags as host elements, so the unstable_
// export must be aliased to a capitalized name to render as a component.
import { unstable_RouterTransitionEndMarker as RouterTransitionEndMarker } from 'next/navigation'

export default function Page() {
  return (
    <>
      <h1 id="end-marker-page">End marker</h1>
      {/* The marker is part of the page's own (static) content: it is
          committed by the navigation itself, so `end` is reported in the
          same React commit as `commit`. */}
      <RouterTransitionEndMarker />
    </>
  )
}
