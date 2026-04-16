export const runtime = 'edge' as string

export default function Page() {
  return <p id="runtime">{process.env.NEXT_RUNTIME}</p>
}
