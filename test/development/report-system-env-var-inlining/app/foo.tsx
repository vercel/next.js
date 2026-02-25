export function Foo() {
  return <p>{process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA}</p>
}
