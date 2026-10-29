export const runtime = 'nodejs'

export default function Page() {
  return <p id="runtime">{process.env.NEXT_RUNTIME}</p>
}
