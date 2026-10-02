// Config lives here (inside __PAGE__ child of inner). The boundary
// lands at `inner` because of depth iteration, and inner/layout.tsx
// is the boundary segment's local mod. If firstModFilePath correctly
// prefers the boundary segment's own layout, the error should point
// at inner/layout.tsx — not this file.
export const instant = { level: 'experimental-error' }

export default function Page() {
  return <p>test-firstmod inner page (should not render)</p>
}
