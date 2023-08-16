export const runtime = 'edge'

export default function Page({ params }) {
  return (
    <>
      <p>catch-all edge page</p>
      <p id="params">{JSON.stringify(params)}</p>
    </>
  )
}
