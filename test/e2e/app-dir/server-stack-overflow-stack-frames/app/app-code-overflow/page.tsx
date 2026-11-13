function recurse(n: number): number {
  return recurse(n + 1)
}

export default function Page() {
  return <p>{recurse(0)}</p>
}
