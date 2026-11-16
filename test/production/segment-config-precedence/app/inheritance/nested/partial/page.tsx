export const preferredRegion = 'sfo1'
export const maxDuration = 0

export default function Page() {
  return <p id="runtime">{process.env.NEXT_RUNTIME}</p>
}
