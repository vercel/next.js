import { theme } from '../../../../variants'

export function unstable_generateStaticVariants() {
  return [[[theme, 1]]]
}

export default function Page() {
  return <p id="page">page</p>
}
