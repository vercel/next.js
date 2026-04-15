export const runtime = 'edge' as const

export default function Page() {
  return <p id="runtime">{process.env.NEXT_RUNTIME}</p>
}
