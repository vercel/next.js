import { locale, theme } from '../../../../variants'

// The two combinations share no variant, so there is nothing they can disagree
// on, and a request that resolves both `theme` and `locale` matches each.
export function unstable_generateStaticVariants() {
  return [[[theme, 'dark']], [[locale, 'en']]]
}

export default function Page() {
  return <p id="page">page</p>
}
