'use client'

// A "use client" module the loading boundary imports for its side effect only.
// This gives the `loading` segment its own client entry chunk while that chunk
// is never rendered as a client *reference* (nothing preloads it with a nonce),
// so the raw <script> element built for the boundary survives into the HTML.
if (typeof window !== 'undefined') {
  window.__boundaryLoadingEffect = true
}

export {}
