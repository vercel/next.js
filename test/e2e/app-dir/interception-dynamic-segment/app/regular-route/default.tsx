import { notFound } from 'next/navigation'

// The children slot intentionally 404s at /regular-route. Make that behavior
// explicit so strict route matching can distinguish it from a synthesized
// fallback left behind by an incomplete matcher.
export default function Default() {
  notFound()
}
