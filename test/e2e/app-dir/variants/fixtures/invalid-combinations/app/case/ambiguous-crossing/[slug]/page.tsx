import { country, locale, theme } from '../../../../variants'

// Each combination assigns a variant the other leaves out, and they agree on
// the one they share.
export function unstable_generateStaticVariants() {
  return [
    [
      [theme, 'dark'],
      [locale, 'en'],
    ],
    [
      [theme, 'dark'],
      [country, 'us'],
    ],
  ]
}

export default function Page() {
  return <p id="page">page</p>
}
