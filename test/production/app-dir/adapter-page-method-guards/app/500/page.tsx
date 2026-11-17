// The dynamic root `not-found.tsx` would otherwise make this page dynamic too.
export const dynamic = 'force-static'

export default function Page() {
  return <p>app 500 page</p>
}
