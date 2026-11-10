export const runtime = 'edge'

export default function DynamicEdgePage() {
  return (
    <>
      <p id="page-dynamic-edge">Dynamic edge page</p>
      <p id="page-dynamic-edge-value">{Math.random()}</p>
    </>
  )
}
