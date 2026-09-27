import { theme } from '../../../../variants'

export function unstable_generateStaticVariants() {
  return [[[theme, 'dark', 'light']]]
}

export default function Page() {
  return <p id="page">page</p>
}
