export default function Hello() {
  // The pages router has no directive semantics: this is ignored there and
  // must not fail the build.
  'use client'
  return <p>hello from pages</p>
}
