export const runtime = 'edge'

export default function Page() {
  return (
    <>
      <p id="which">slot</p>
      <p id="runtime">{process.env.NEXT_RUNTIME}</p>
    </>
  )
}
