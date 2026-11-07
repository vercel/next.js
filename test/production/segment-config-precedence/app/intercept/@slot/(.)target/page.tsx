export const runtime = 'edge'
export const preferredRegion = 'iad1'
export const maxDuration = 10

export default function Page() {
  return <p id="intercepted">{process.env.NEXT_RUNTIME}</p>
}
