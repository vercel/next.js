export const runtime = 'edge'

export default function Page() {
  return (
    <>
      <p id="which">main</p>
      <p id="runtime">{process.env.NEXT_RUNTIME}</p>
    </>
  )
}
