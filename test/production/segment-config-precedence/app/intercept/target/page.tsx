export const runtime = 'nodejs'
export const preferredRegion = 'fra1'
export const maxDuration = 30

export default function Page() {
  return <p id="runtime">{process.env.NEXT_RUNTIME}</p>
}
