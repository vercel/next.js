export const runtime = undefined
export const preferredRegion = undefined
export const maxDuration = undefined

export default function Page() {
  return <p id="runtime">{process.env.NEXT_RUNTIME}</p>
}
