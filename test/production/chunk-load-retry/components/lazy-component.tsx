'use client'

// Marker for finding the chunk in tests
const COMPONENT_MARKER = 'CHUNK_LOAD_RETRY_TEST_MARKER'

export default function LazyComponent() {
  return (
    <div data-testid="lazy-component">
      <p>This is a lazy loaded async component - {COMPONENT_MARKER}</p>
    </div>
  )
}
