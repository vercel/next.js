export const revalidate = 2
export const dynamic = 'error'

export default function Page() {
  return <pre id="random">{Math.random()}</pre>
}
