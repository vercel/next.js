'use client'

// This is a client component that only renders during SSR,
// but will be replaced by stream rendering and replaced with icon insertion script tag.
// We don't want it to be presented anywhere so it's only visible during streaming,
// right after the icon meta tags so that browser can pick it up asap it's rendered.
export const IconMark = () => {
  if (typeof window !== 'undefined') {
    return null
  }
  return <meta name="«nxt-icon»" content="" />
}
