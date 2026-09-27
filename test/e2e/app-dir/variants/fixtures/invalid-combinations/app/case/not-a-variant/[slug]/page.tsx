// The first element of the tuple is the name of a variant, and not the variant
// itself.
export function unstable_generateStaticVariants() {
  return [[['theme', 'dark']]]
}

export default function Page() {
  return <p id="page">page</p>
}
