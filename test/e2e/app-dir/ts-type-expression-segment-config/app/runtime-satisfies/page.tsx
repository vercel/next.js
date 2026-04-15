export const runtime = 'edge' satisfies string

export default function Page() {
  return <p id="runtime">{process.env.NEXT_RUNTIME}</p>
}
