export const runtime = 'nodejs'
export const preferredRegion = 'sfo1'
export const maxDuration = 20

export default function NotFound() {
  return <p id="not-found-runtime">{process.env.NEXT_RUNTIME}</p>
}
