// A very deeply nested element tree makes React's own Flight runtime recurse
// until the stack overflows, so every frame of the thrown RangeError belongs to
// React code that is ignore-listed by the dev server's error formatting.
const DEPTH = 100_000

export default function Page() {
  let tree: React.ReactNode = 'leaf'

  for (let i = 0; i < DEPTH; i++) {
    tree = <div>{tree}</div>
  }

  return tree
}
