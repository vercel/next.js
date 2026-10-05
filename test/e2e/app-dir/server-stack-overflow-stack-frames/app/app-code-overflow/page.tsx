// Contrast case: the overflow is thrown by application code, so the stack
// contains frames that are not ignore-listed.
function recurse(n: number): number {
  return recurse(n + 1)
}

export default function Page() {
  return <p>{recurse(0)}</p>
}
