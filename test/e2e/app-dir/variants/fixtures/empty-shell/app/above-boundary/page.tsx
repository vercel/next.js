import { theme } from '../../variants'

export async function generateStaticVariants() {
  return [[[theme, 'light']], [[theme, 'dark']]]
}

// The variant is read with no boundary above it, so the prerender that omits
// the variants comes out empty. The build has to reject that.
export default async function Page() {
  return <p id="theme">{await theme()}</p>
}
